# Workflow & Approval Rules

Implementation: `src/lib/workflow/engine.ts`, `src/server/services/approval.ts`.

## Statuses

| Status | Meaning | Next |
|---|---|---|
| `DRAFT` | Created, not submitted. Visible only to the requester. | `SUBMITTED`, `CANCELED` |
| `SUBMITTED` | In the chain; current approver has not opened it. | `IN_REVIEW`, `APPROVED`, `REJECTED`, `RETURNED`, `CANCELED` |
| `IN_REVIEW` | Current approver has opened it. | `APPROVED`, `REJECTED`, `RETURNED`, `CANCELED` |
| `APPROVED` | All steps approved. Terminal. | — |
| `REJECTED` | Declined. Terminal. | — |
| `RETURNED` | Sent back for correction. | `SUBMITTED` (resubmit), `CANCELED` |
| `CANCELED` | Withdrawn by the requester. Terminal. | — |

Transitions are validated by `canTransition()` on the server. An out-of-order transition is rejected even if the request arrives as a direct POST.

## Materialization

Submitting evaluates each template step's condition against the request's own facts and writes the surviving steps to `approval_steps`.

```
template steps + facts (amount, days, international, quotations)
        │
        ├─ condition false        → step skipped
        ├─ approver unresolvable  → step skipped
        ├─ approver = requester   → step skipped   (self-approval impossible)
        ├─ same as previous step  → collapsed      (one person, one decision)
        └─ otherwise              → materialized, bound to a person, SLA clock set
```

If every step collapses away — the Director filing their own request — a single Director step is retained so nothing can reach `APPROVED` without a human decision.

### Conditions

| Type | Fires when |
|---|---|
| `ALWAYS` | Always |
| `AMOUNT_GT` | `amount_base > value` |
| `DAYS_GT` | `days > value` (leave working days, trip duration) |
| `INTERNATIONAL` | Trip crosses a border |
| `QUOTATIONS_LT` | Attached quotations `< value` |

### Approver resolution

| Role | Resolves to |
|---|---|
| `MANAGER` | `employees.manager_id` of the requester |
| `DEPT_HEAD` | `departments.head_employee_id`; if that is the requester, escalates to their manager |
| `HR` | HR Manager |
| `FINANCE` | Finance Manager |
| `DIRECTOR` | Managing Director |
| `CTO` | Executive holder designated in system settings (`approver.CTO`) |
| `CEO` | Executive holder designated in system settings (`approver.CEO`) |

### Role step vs named step

A step resolves its approver one of two ways:

| Mode | Stored as | Resolved |
|---|---|---|
| By role | `approver_role`, `approver_employee_id` null | Per request, from the requester's own org chart |
| Named person | `approver_employee_id` set | Exactly that person; the role becomes a label only |

A named approver is what makes a fixed chain such as 폴 → 비키 → 에이든 → CTO → CEO expressible. A
role step is what makes one workflow serve thirty employees with thirty different managers. Both are
configured in the workflow builder without a developer, and both are subject to the three
normalization rules below.

## Seeded routes

| Type | Steps |
|---|---|
| Annual Leave | Manager → HR → *(Director if > 7 working days)* |
| Business Trip | Manager → *(Dept Head if > $500)* → *(Director if international)* |
| Purchase | Dept Head → Finance → *(Director if > $1,000)* |
| Expense | Manager → *(Finance if > $50)* |
| HR Request | Manager → HR |
| General | Manager → *(Director if > $1,000)* |

Editable at **Admin → Workflow Builder**. Changes apply to future submissions only.

## Actions

| Action | Who | Effect |
|---|---|---|
| Submit | Requester | Materializes steps, sets `SUBMITTED`, starts step 1 SLA, notifies approver 1 |
| Approve | Named approver of current step | Step `APPROVED`. Next step starts, or the request reaches `APPROVED` and post-approval effects run |
| Reject | Named approver | Request `REJECTED`, terminal. Requester notified |
| Return | Named approver | Request `RETURNED`, editable again. Resubmitting re-materializes from step 1 |
| Cancel | Requester | Request `CANCELED`, remaining steps `SKIPPED` |

Every action writes `approval_actions` **and** `audit_logs` in the same transaction as the status change.

## Post-approval effects

Reaching `APPROVED` runs, transactionally:

| Type | Effect |
|---|---|
| Leave | `leave_balances.pending` → `used` |
| Purchase | `budgets.committed` → `spent` |
| Expense | `budgets.committed` → `spent`, `expense_claims.reimbursed_at` set |
| Trip | Travel analytics pick it up (derived, no write) |

Submission performs the mirror operation into `pending` / `committed`; cancel and reject release it. Aggregates therefore cannot drift from the requests that produced them.

## SLA

Each step carries `sla_hours`. `due_at` is set when the step becomes active — not at submission — so a slow step 1 does not consume step 2's budget.

- **Overdue** — `now > due_at` and the step is unresolved.
- **Average approval time** — mean of `completed_at - started_at` across completed steps.
- **Bottleneck** — the same average grouped by `approver_role`.

## Smart priority

Oldest-first buries the requests that matter. `scorePriority()` produces 0–100 from:

| Factor | Weight |
|---|---|
| Overdue | +45 |
| Due within 6h / 24h | +32 / +18 |
| Amount ≥ $5,000 / $2,000 / $500 | +28 / +20 / +12 |
| AI risk HIGH / MEDIUM | +20 / +10 |
| Blocking policy violation | +12 |
| Leave (team-coverage sensitivity) | +6 |

`≥70` Critical · `≥48` High · `≥22` Normal · else Low. Default inbox sort is priority, then SLA, then submission date.

## Concurrency

Two approvers acting at once is a real scenario. Every decision runs inside a transaction that re-reads the step and asserts it is still `PENDING`/`IN_REVIEW` before writing. The loser gets "This request has already been decided" rather than a double-approval.
