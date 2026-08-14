# TODO

Severity: **P0** blocks completion · **P1** should be next · **P2** valuable · **P3** nice to have

---

## P0 — blocking

*None open.* All 14 defects found during QA are fixed; see `docs/QA_SCORECARD.md`.

---

## P1 — next

- [ ] **Attachment storage.** Metadata, hashing and access control are real; bytes are not persisted. Wire `attachments.storage_path` to Supabase Storage or S3, add signed-URL download with a permission check.
- [ ] **Receipt vision extraction.** `AnthropicProvider.extractExpense` handles pasted text. Add image upload → vision model → structured line, replacing the filename inference.
- [ ] **External notification transports.** Notification records are written and rendered in-app. Add Teams and email adapters behind the same interface.
- [ ] **Organization editing in the UI.** Currently read-only; department head changes require database access even though routing reads them live.

## P2 — valuable

- [ ] **Batch approval** for low-risk items. Selection UI and the engine both support it; deliberately not enabled without a considered confirmation step.
- [ ] **Recommendation-quality tracking.** `helpful_votes` / `unhelpful_votes` are captured but nothing consumes them.
- [ ] **Parallel AI backfill.** The startup backfill is sequential; fine for 27 open requests, slow at 500.
- [ ] **Mobile card layout** for the densest tables, instead of horizontal scroll.
- [ ] **Saved filter views** on the approval inbox — filters already live in the URL, so this is persistence plus a picker.
- [ ] **Live exchange rates.** The schema stores rates per effective date; the seed uses static reference rates.

## P3 — later

- [ ] Request editing after `RETURNED` currently means re-entering the form; add a prefilled edit route.
- [ ] Delegation / out-of-office approver substitution.
- [ ] Multi-currency display toggle (data is captured; presentation is USD-only).
- [ ] PDF export alongside CSV.
- [ ] Server-side rendering of charts for print.

---

## Known limitations (accepted, not defects)

Documented in the README with the seam each one attaches to. They are scope decisions, not omissions to fix:

- PGlite is single-writer — stop the dev server before `npm run db:reset`.
- No unattended auto-approval, by product rule.
- Credential auth rather than Supabase Auth; `database/rls.sql` covers the migration.
- `ENABLE_TEST_LOGIN` must never be set in production (the endpoint returns 404 there regardless).
