# Information Architecture

## Navigation

```
OHMY ONE
│
├─ MAIN
│  ├─ Home                    /                  Dashboard, AI morning brief, "needs your attention"
│  └─ AI Assistant            /assistant         Ask anything about company data
│
├─ WORK
│  ├─ Approvals               /approvals         Inbox — what is waiting on you
│  ├─ My Requests             /requests          What you submitted
│  └─ New Request             /requests/new      Type picker → form (or draft with AI)
│
├─ PEOPLE
│  ├─ Employees               /people            Directory + profile
│  ├─ Leave                   /leave             Balance, history, team calendar
│  └─ Calendar                /calendar          Leave + trips in one view
│
├─ FINANCE
│  ├─ Expenses                /expenses          Claims + expense analytics
│  ├─ Purchase Requests       /procurement       PR + vendors + price history
│  └─ Budgets                 /budgets           Allocated / committed / spent
│
├─ TRAVEL
│  └─ Business Trips          /travel            Trips + travel analytics
│
├─ MANAGEMENT
│  ├─ Analytics               /analytics         Cross-module analysis with filters
│  ├─ Reports                 /reports           10 presets + CSV export
│  └─ Audit Logs              /audit             Every recorded action
│
└─ ADMIN
   ├─ Workflow Builder        /admin/workflows
   ├─ Policies                /admin/policies
   ├─ Organization            /admin/organization
   ├─ Users                   /admin/users
   └─ System Settings         /admin/settings
```

Nav items hide when the session lacks the capability — but hiding is cosmetic. Every page re-checks server-side, so typing the URL gets a 403 page rather than the content.

## Page anatomy

### Home — answers "what should I do now?"
Ordered so the answer is above the fold:
1. **AI Morning Brief** — named exceptions, not totals. Actions: *Review critical requests*, *Ask AI*.
2. **Needs your attention** — critical/overdue approvals, returned requests, budget warnings.
3. **Metric tiles** — pending approvals, requests this month, monthly spend, on leave, active trips, PR pending, avg approval time, SLA overdue.
4. **Charts** — approval status, 6-month trend, spend by department, spend by category, leave overview, upcoming trips, approval bottleneck.

Tiles and charts are scoped by role: an Employee sees their own numbers, a Manager their department, a Director the company.

### Approval Inbox
Dense table: priority · type · ID · title · requester · department · amount · status · submitted · current approver · SLA · AI risk · actions.
Filters: type, department, requester, status, date, amount, priority, risk. Default sort: AI priority → SLA → date.

### Request Detail — the screen approvers live in
Three columns on desktop, stacking to one on mobile:

| Left | Center | Right |
|---|---|---|
| Request info, requester, department, amount, dates, attachments | Type-specific content, approval timeline, comment feed | **AI Review Panel** — summary, checks, comparison, recommendation + confidence, *Why?*, copilot, feedback |

Decision buttons (Approve / Return / Reject) are pinned and always reachable.

## URL conventions

| Pattern | Purpose |
|---|---|
| `/requests/[id]` | One request, any type. The detail page dispatches on `request_type`. |
| `/requests/new/[type]` | Typed create form |
| `/approvals?status=&type=&risk=` | Filters are URL state — shareable and reloadable |
| `/people/[id]` | Employee profile, RBAC-filtered |

Filter and pagination state lives in the URL, never in component state, so a filtered view survives reload and can be pasted to a colleague.

## Global surfaces

| Surface | Trigger | Does |
|---|---|---|
| Command bar | `Cmd/Ctrl + K` | Navigate, create, search, ask AI |
| Universal search | Header | Employees, requests, trips, vendors, amounts in one result set |
| Notifications | Header bell | Approval required, decided, returned, budget and policy warnings |
| Theme | Header | Light / dark / system |

## Empty, loading, error

Every list has all three. Empty states name the next action ("No pending approvals. You're all caught up."). Lists stream with skeletons. Errors are typed: permission denied, not found, AI unavailable, validation — each with its own recovery path.
