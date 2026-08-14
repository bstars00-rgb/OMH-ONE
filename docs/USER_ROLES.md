# User Roles & Access Control

## Roles

| Role | Description |
|---|---|
| `SUPER_ADMIN` | Full configuration and data access |
| `ADMIN` | Workflow, policy, organization and user configuration |
| `DIRECTOR` | Company-wide approval and analytics |
| `HR` | Employee records, leave data, HR requests |
| `FINANCE` | Expense, procurement, budget |
| `MANAGER` | Own department's requests and approvals |
| `EMPLOYEE` | Own requests only |
| `AUDITOR` | Read-only across the company |

A user may hold several roles (`user_roles`). `users.primary_role` only decides the default landing view.

## Capability matrix

Source of truth: `src/lib/rbac.ts`. Changing that file changes behaviour; this table documents it.

| Capability | SUPER_ADMIN | ADMIN | DIRECTOR | HR | FINANCE | MANAGER | EMPLOYEE | AUDITOR |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `request.create` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `request.approve` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `request.viewAll` | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| `employee.viewAll` | ✓ | ✓ | ✓ | ✓ | — | ✓¹ | — | ✓ |
| `employee.manage` | ✓ | ✓ | — | ✓ | — | — | — | — |
| `leave.manageAll` | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `finance.view` | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| `budget.manage` | ✓ | ✓ | — | — | ✓ | — | — | — |
| `analytics.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `analytics.company` | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| `reports.export` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `audit.view` | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| `admin.workflow` | ✓ | ✓ | — | — | — | — | — | — |
| `admin.policy` | ✓ | ✓ | — | — | ✓ | — | — | — |
| `admin.users` | ✓ | ✓ | — | — | — | — | — | — |
| `admin.settings` | ✓ | ✓ | — | — | — | — | — | — |
| `admin.organization` | ✓ | ✓ | — | ✓ | — | — | — | — |

¹ Manager sees only their own department's employees.

**`AUDITOR` is read-only.** The role is excluded from every mutating capability by an explicit check, not by omission from the table — so adding a new mutating capability cannot accidentally grant it write access.

## Row-level visibility

`requestVisibility(session)` returns a SQL predicate that is `AND`-ed into **every** request query. It is not a view-layer filter, so guessing a request ID in the URL does not bypass it.

| Role | Can read which `requests` rows |
|---|---|
| `EMPLOYEE` | Own requests + any request where they are a named approver |
| `MANAGER` | The above + all requests from their department |
| `HR` | The above + all `LEAVE` and `HR` requests company-wide |
| `FINANCE` | The above + all `EXPENSE` and `PURCHASE` requests company-wide |
| `DIRECTOR` / `ADMIN` / `SUPER_ADMIN` / `AUDITOR` | All requests |

## Office scope

Row visibility has a second dimension. Each office (본사 and each 지사) is a tenant boundary, and the
office clause is **AND**-ed on top of the role clause above — being a named approver on a request does
not grant a tour of that office's other requests.

| Role | Office scope |
|---|---|
| `EMPLOYEE` / `MANAGER` / `HR` | Own office only |
| `SUPER_ADMIN` / `ADMIN` / `DIRECTOR` / `FINANCE` / `AUDITOR` | Consolidated across all offices; may switch to one office from the header |

`FINANCE` is consolidated deliberately: 회계팀 closes the books for the group, so scoping them to one
office would make group accounting impossible.

The scope is resolved once per request into `session.activeOfficeId` (`requireLiveSession`), so no query
function takes an office parameter and there is nowhere to forget it. A user who forges the office
cookie is rejected — the value is validated against what their role may see, which
`npm run test:rbac` asserts.

## Decision authority

Holding `request.approve` is not enough to decide a specific request. `canActOnStep()` additionally requires that the session **is the named approver of the current pending step**. An `ADMIN` may act as a delegate; the delegation is recorded in `audit_logs`.

A request is never routed to its own requester (`materializeSteps` drops such steps), so self-approval is structurally impossible rather than merely discouraged.

## Editing

| Action | Allowed when |
|---|---|
| Edit request | Requester only, and status is `DRAFT` or `RETURNED` |
| Cancel request | Requester only, and status is not terminal |
| Approve / reject / return | Named approver of the current step (or delegating admin) |

## Demo accounts

Password for all: `demo1234` — prototype only, not a production credential.

| Email | Person | Roles | Use it to see |
|---|---|---|---|
| `aiden@ohmyhotel.com` | Aiden Park, Managing Director | `DIRECTOR` | Executive view, the full approval backlog, management AI |
| `admin@ohmyhotel.com` | Ethan Park, IT Manager | `SUPER_ADMIN`, `ADMIN`, `MANAGER` | Workflow builder, policy engine, users, settings |
| `mia@ohmyhotel.com` | Mia Song, HR Manager | `HR`, `MANAGER` | Leave administration, team calendar, HR requests |
| `finance@ohmyhotel.com` | Olivia Chen, Finance Manager | `FINANCE`, `MANAGER` | Budget, procurement and expense review |
| `vicky@ohmyhotel.com` | Vicky Nguyen, SCM Manager | `MANAGER` | Department-scoped approvals and analytics |
| `employee@ohmyhotel.com` | Bryant Vo, SCM Specialist | `EMPLOYEE` | The requester experience, and how little is visible |
| `auditor@ohmyhotel.com` | Sena Ko, Financial Analyst | `AUDITOR` | Read-only company-wide access; every action button is absent |

All 30 seeded employees have an account (`firstname.lastname@ohmyhotel.com`) with the same password.
