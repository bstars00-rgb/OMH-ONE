# AI Architecture

## Principle

**AI recommends. Humans decide.** No AI path can move a request to `APPROVED` or `REJECTED`. Every recommendation carries a confidence value and an inspectable reason. The UI always labels output as a recommendation.

## Provider abstraction

```ts
interface AIProvider {
  summarizeRequest(ctx: RequestContext): Promise<RequestSummary>;
  reviewPolicy(ctx: RequestContext): Promise<PolicyReview>;
  detectRisk(ctx: RequestContext): Promise<RiskAssessment>;
  extractExpense(input: ReceiptInput): Promise<ExpenseDraft>;
  generateForm(prompt: string, type: RequestType, ctx: FormContext): Promise<FormDraft>;
  answerManagementQuery(q: string, ctx: AnalyticsContext): Promise<ManagementAnswer>;
  answerRequestQuestion(q: string, ctx: RequestContext): Promise<CopilotAnswer>;
}
```

Two implementations:

| Provider | When | Behaviour |
|---|---|---|
| `MockAIProvider` | `AI_PROVIDER=mock` (default), or no API key, or the real provider fails | Deterministic, computed from real database context. Not random text. |
| `AnthropicProvider` | `AI_PROVIDER=anthropic` + `AI_API_KEY` | Calls Claude with the same assembled context, returns the same typed shapes |

`getAIProvider()` resolves once per request. `AnthropicProvider` wraps every call in a try/catch that falls back to `MockAIProvider` and flags `degraded: true`, which the UI surfaces as "AI running in offline mode".

### Why the mock is not a stub

Every number the mock states is queried from Postgres before it is phrased:

> "Previous Seoul trips averaged $620 per traveller. This request is $770 — 24% above average."

is `AVG(total_base / traveller_count)` over prior approved Seoul trips, compared to this one. Policy checks read the `policies` table. Budget checks read `budgets`. Duplicate detection reads `receipt_hash`. Only the *sentence construction* is templated — the findings are real.

This matters for two reasons: the demo works with no key and no network, and turning on the real provider changes the prose quality, not the correctness of the analysis.

## Context assembly

The provider never queries the database. `src/lib/ai/context.ts` builds a typed, pre-authorized context:

```
buildRequestContext(requestId, session)
  → request + detail rows
  + requester, department, approval chain
  + policies applicable to this type
  + budget position for department/category/quarter
  + peer history (similar trips / prior purchases of the item / this employee's pattern)
  + team overlap (leave collisions, same-destination travellers)
```

Assembly runs **after** the RBAC check, so nothing enters a prompt that the user could not already read. This is also the boundary that keeps a future real-LLM call from leaking another department's data.

## Safe natural-language query

Free-text questions must not become free-text SQL. The path is:

```
"How much did SCM spend on travel this quarter?"
        │
        ▼  intent classification → one of a fixed set of query intents
   { intent: 'SPEND_BY_DEPARTMENT', department: 'SCM',
     category: 'TRAVEL', period: 'CURRENT_QUARTER' }
        │
        ▼  validated against a Zod schema (unknown enum value → rejected)
        ▼  executed by a hand-written parameterized query
        ▼  result + RBAC scope → phrased answer
```

**The AI never emits SQL.** It selects an intent and fills parameters from closed enums. An unrecognized question returns "I can't answer that from the available data" instead of guessing. Every query carries the caller's `requestVisibility` predicate, so asking about another department's spend returns the scoped answer, not a leak.

## Surfaces

| Surface | Where | Provides |
|---|---|---|
| Request summary | Detail page | 3–4 lines: what, who, when, how much |
| Policy check | Detail page | Pass / warn / fail per applicable policy, with the number and the threshold |
| Risk detection | Detail + inbox badge | LOW / MEDIUM / HIGH from budget, policy, duplicates, price deltas |
| Recommendation | Detail page | APPROVE / REVIEW / REJECT + confidence % + reason, with *Why?* |
| Copilot | Detail page | "Why is this expensive?", "Compare with previous Seoul trips", "Summarize in Korean" |
| Form generator | New request | One sentence → structured draft the user reviews before submitting |
| Receipt extraction | Expense form | Merchant, date, currency, amount, tax, category |
| Morning brief | Home | Named exceptions for this user's scope |
| Management answers | Assistant / Analytics | Summary → Evidence → Risk → Recommended action |
| Proactive insight | Home | Trend breaks, concentration, budget burn, duplicate suspicion |

## Persistence

`ai_reviews` caches summary, checks, recommendation, confidence and risk per request, so an approver opening a request twice sees a stable assessment. It is invalidated when the request is edited. `ai_conversations` / `ai_messages` store copilot threads. `helpful_votes` / `unhelpful_votes` capture the feedback control — the schema for recommendation-quality tracking, which nothing consumes yet.

## Failure behaviour

| Failure | Result |
|---|---|
| No API key | `MockAIProvider`. Everything works. No warning — this is a supported mode. |
| API error / timeout | Fall back to mock, banner: "AI is running in offline mode." |
| Unparseable model output | Discarded, mock used. Logged. |
| Question outside the intent set | "I can't answer that from the available data," with suggestions. |

Approval never depends on AI. If every AI surface returned nothing, the approval workflow would be unaffected.

## Prompt-injection posture

Request titles, descriptions and comments are user-authored and reach the real provider. They are wrapped in explicit data delimiters and the system prompt states that content inside them is data, never instruction. Because the model can only choose an intent from a closed set and can never emit SQL or trigger a mutation, a successful injection can at worst produce a wrong *sentence* — it cannot approve a request, read another department's rows, or write to the database.
