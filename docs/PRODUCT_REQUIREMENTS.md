# OHMY AI ERP — Product Requirements

> One place to request, approve, analyze and operate.

## 1. Problem

OHMY currently runs approvals through Microsoft Teams Approval. It works as a message queue and fails as a system of record:

| # | Problem today | Consequence |
|---|---|---|
| 1 | Approval data is unstructured | No reporting without manual Excel work |
| 2 | No dashboard | Nobody knows the current backlog |
| 3 | No cost analysis by month / person / department | Budget overruns are found after the fact |
| 4 | Leave usage is invisible | Team coverage clashes discovered too late |
| 5 | Trip cost and history not tracked | No benchmark for "is this trip expensive?" |
| 6 | PR not linked to purchase history | Same item bought twice at different prices |
| 7 | Approvers read long free text | Slow, inconsistent decisions |
| 8 | Policy compliance checked by humans | Violations pass silently |
| 9 | Past requests are hard to find | Institutional memory lives in chat threads |
| 10 | Management reporting is manual | Stale by the time it is read |
| 11 | Bottlenecks are invisible | No idea which step is slow |
| 12 | No path to Accounting / Asset / Contract | Every future module starts from zero |

## 2. Product principle

Conventional ERP is `Input → Save → Search`.

OHMY AI ERP is:

```
Input → AI Understand → AI Validate → AI Recommend → Approval → AI Analyze → Management Insight
```

The user enters the minimum. The system does the structuring, the checking and the comparing.

**The AI never decides.** It summarizes, validates, compares and recommends with a stated confidence and a visible reason. A human approves. This is a product rule, not a limitation — it is what makes the recommendation trustworthy enough to act on.

## 3. Scope — this prototype

### Delivered

| Area | Capability |
|---|---|
| Auth | Credential login, httpOnly JWT session, 8 seeded roles, server-side enforcement on every page and action |
| Approval engine | One engine for all 6 request types. Conditional multi-step routing, approve / reject / return / cancel, full timeline and audit trail |
| Leave | Working-day calculation with public holidays, live balance, team collision detection, team calendar |
| Business trip | Multi-traveller, cost breakdown by category, FX capture, travel analytics, historical cost comparison |
| Procurement | Line items, vendor, quotation rules, budget commitment, price-history comparison |
| Expense | Multi-line claims, receipt handling, duplicate detection by receipt hash, trip linking |
| AI | Summary, policy review, risk detection, form generation from free text, natural-language search, management brief, per-request copilot |
| Analytics | Home dashboard, executive view, spend / approval / leave / travel / procurement analysis, SLA and bottleneck |
| Admin | Workflow builder, policy engine, users and roles, organization, system settings |
| Reports | 10 preset reports, CSV export |

### Explicitly out of scope

Accounting / AP / AR, invoicing, contract management, asset register, payroll, attendance clock-in, recruitment, inventory, CRM. The data model leaves room for these (see `DATABASE_DESIGN.md` §Extension points) but none are built.

### Deliberately not built, and why

| Not built | Reason |
|---|---|
| Real OCR on uploaded receipt images | Requires a vision API key. The extraction **interface** and the full downstream flow are built; `MockAIProvider` returns deterministic structured output so the flow is exercised end to end. Swapping in a real provider is a config change. |
| Automatic approval of low-risk requests | Product rule §2 — AI recommends, humans decide. Batch approval UI exists; unattended auto-approval does not. |
| Email / Teams / Slack delivery | `NotificationService` abstraction is built and in-app delivery works. External transports are adapters against the same interface. |
| File upload to object storage | Attachment metadata, hashing and access control are real. Bytes are not persisted in the prototype; `storagePath` is the seam for S3 / Supabase Storage. |

## 4. Users and jobs

| Role | Primary job | Success looks like |
|---|---|---|
| Employee | Submit a request without knowing the rules | Request routed correctly, status always visible |
| Manager | Clear the queue without reading everything | Decide a low-risk item in one click, spot a risky one immediately |
| HR | Protect leave entitlement and coverage | Sees balance and collisions before approving |
| Finance | Protect the budget | Sees budget impact and price history before approving |
| Director | Know what needs attention in 30 seconds | Morning brief names the exceptions, not the totals |
| Admin | Change rules without a developer | Edits a workflow or policy in the UI |
| Auditor | Verify what happened | Read-only access to every action with actor and timestamp |

## 5. Critical flows

All five must work against the database, survive a browser reload, and update every downstream view.

1. **Leave** — Employee submits → Manager approves → HR approves → balance decrements, calendar updates.
2. **Trip** — Employee drafts with AI from one sentence → submits → Director sees AI summary and cost comparison → approves → travel dashboard and budget update.
3. **Purchase** — Employee submits → Dept head → Finance validates budget → Director → budget `committed` moves to `spent`.
4. **Expense** — Employee submits with receipt → AI extraction fills the draft → duplicate check runs → Manager approves → expense analytics update.
5. **Ask** — Director asks "why did travel expenses increase this month?" → system answers from stored data with evidence.

## 6. Non-functional requirements

| Requirement | Target |
|---|---|
| Server-side authorization | Every page, action and route handler. No client-side-only gate. |
| Row-level visibility | Enforced in SQL, not in the view layer |
| Data survives reload | All state in Postgres; no request state in React state |
| AI unavailable | App fully functional; AI surfaces degrade with an explicit notice |
| Large tables | Server-side filter, sort and pagination |
| Accessibility | Keyboard navigable, labelled controls, status never conveyed by colour alone |
| Responsive | Desktop-first (1440+), usable to 375px |
| Build health | 0 TypeScript errors, 0 lint errors, 0 build errors |

## 7. Acceptance

The prototype is accepted when the demo in §5 runs end to end against a real database, every button performs a real operation, and the final QA score is ≥ 95/100 (`QA_SCORECARD.md`).
