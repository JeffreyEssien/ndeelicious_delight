# Admin fixes part 2 — implementation and verification report

This is an implementation report, not a declaration that every acceptance criterion is complete. The tracker is the authoritative record of status and limitations. No production database, Stripe transaction or customer email was changed during this work.

## Original complaints and changes

| Complaint | Implemented resolution | Verification and limits |
| --- | --- | --- |
| Orders disappear beyond 100 and become hard to manage | Database pagination at 25/50/100; operational categories; full-history number/customer/email/phone search; payment, stage, method and date filters; deterministic sorting; URL state; streamed filtered CSV; per-record validated bulk advancement | Real migration tests cover 0, 5, 100, 101, 500, 1,000 and 5,001 orders. Browser checks cover filters, navigation, retry, selection and responsive details. |
| Order details overflow and mix unrelated controls | On-demand details; URL-addressable accessible dialog; top Back control; explicit next action; separate customer, item, finance, documents, notes and activity sections; secondary refund/stage controls | The dialog uses the existing focus trap, Escape and focus restoration. Back preserves list filters. Purchase configuration comes from saved item snapshots. Existing refund idempotency, lifecycle and notification tests remain. |
| Invoices, receipts and quotes are poorly arranged | Shared financial presentation rules, restrained branding, Letter print layout, readable parties and aligned totals; composer action grid; PDFKit with embedded licensed Noto fonts, measured wrapping and repeated multi-page headers | Actual PDF text extraction tests cover all three designs, 70-item documents, long contacts, special characters, invoice payment states and refunds. Browser checks assert preview totals, authenticated PDF downloads, print visibility and control bounds. Unsupported glyphs return an explicit error with HTML printing available. |
| Cake requests are unattractive and hard to process, with invisible old history | Database categories, pagination and full-history search; request summaries; short-lived private thumbnails; on-demand private gallery and human-readable preferences; read-only quote preview before sending; linked order; queued/sent/failed/retry distinction and latest 25 quote revisions | SQL tests reach all 5,001 requests. Existing approval/conversion and immutable tax snapshot checks pass. Browser tests cover review, preview and changed-price preview invalidation. External email delivery is not verified against a live mail provider. |
| Inventory becomes overwhelming and blur edits are unsafe | Product-level pagination/search/counts; expandable variant groups; inactive/untracked stock excluded from shortages; explicit add/remove/set with expected-stock comparison, confirmation and transactional audit | 501-product pagination tests and actual adjustment RPC tests cover stale/repeated/concurrent requests, invalid/negative/overflow values, reservation protection and audit rollback. No stock write occurs on blur. |
| Cake management exposes too much complexity | Quick draft creation, owner-friendly option groups, photo upload/preview, automatically maintained slugs, progressive advanced settings, use-all choice presets, option ordering and availability; changed-cake-only saves; atomic option saves and publication requirements | Drafts can be incomplete. Publishing requires price, positive preparation time, confirmed tax classification and active choices in all mandatory groups. Removed choices are disabled, preserving historical relationships and snapshots. Unsaved changes prompt when leaving or switching the workspace. |
| Unspecified numbered screenshots and poor global layouts | Independent multi-width/theme admin audit; identified defects recorded separately in the tracker | Exact feedback items 3, 5, 6 and 7 remain **Blocked — reference unavailable**. Generated baseline captures are not the absent client references. |
| Admin loads unrelated resources | Section-specific loading; summary/detail APIs for orders, cakes and inventory; bounded quotation history; database dashboard aggregates with five recent summaries | Legacy Customers, catalogue editing and full Analytics loading remain separately identified scalability limits; they are not represented as verified refactors. |

## Architecture and data access

`admin_history_page` performs search, filtering, category aggregates, matching count and bounded selection inside PostgreSQL. It returns summaries, not complete items, payment objects, events or private galleries. Order item quantity is aggregated only for selected rows. Cake thumbnails use only the first reference of each selected request; the authenticated handler signs those paths for ten minutes and removes storage paths from the response.

Opening a record calls the separate authenticated detail endpoint. It loads the saved purchase/configuration data and signs detail references. It does not refresh unrelated admin resources. The URL includes filters, page and optional `detail`, making the accessible dialog equivalent to a details route for deep linking and return navigation.

Ordering includes an ID tie-breaker. An `asOf` creation cutoff excludes ordinary newly created records from subsequent page requests; Refresh and filter changes include newer records. This is offset pagination with a creation cutoff, not a historical transaction snapshot: existing records can move when sort fields or category membership change. Refresh reconciles the current view, and full-history search/All remain available.

Filtered CSV output pulls at most 100 summaries per database request, streams incrementally and quotes cells with spreadsheet formula protection. Bulk advancement validates expected state independently per order, retains lifecycle rules and returns successful/skipped/failed outcomes. It cannot change payments or issue refunds.

Inventory RPCs paginate products, not individual variants. Adjustments lock product then variant, compare the displayed quantity, delegate reservation-safe inventory updates, and write the audit in the same transaction. A failed audit rolls the stock change back.

HTML and PDF use the same normalized stored DTO, total rows, tax labels and semantic messages. PDFKit embeds regular/bold fonts and measures text instead of replacing characters. Documents are read from immutable snapshots; previewing or downloading does not send email. Quote preview uses the same content factory as quote issuance without persistence or delivery effects.

## Migrations

Apply migrations only after checking the target database and prior migration state:

| Migration | Purpose |
| --- | --- |
| `0034_admin_history.sql` | Summary history RPC, global category aggregates and history/payment/item indexes; execute restricted to service role |
| `0035_admin_safe_operations.sql` | Compare-and-set bulk order transitions and reservation-safe stock adjustments with transactional audit |
| `0036_inventory_pagination.sql` | Product-group inventory pagination/counts/search and catalogue/variant indexes |
| `0037_cake_publication.sql` | Transactional cake publication validation, changed-cake assignment saves and historical option preservation |
| `0038_admin_dashboard.sql` | Scalar dashboard aggregates, five recent summaries and latest-payment index |

Do not deploy the calling code before these RPCs exist. Apply in numeric order after the existing migrations through 0033, inspect grants, and run an isolated staging smoke test with real Supabase authorization. New API errors are explicit/retryable when a migration is missing. Existing financial records are not backfilled or rewritten by these migrations. The publication guard may require owners to finish incomplete active legacy cakes before editing their choices.

The build traces both font files and the local branding image into each PDF route. Fonts and their OFL license are checked into `public/fonts`; deploy those assets with the source. The existing public `product-images` bucket also stores cake photos. Uploaded photos are audited, and failed audit attempts trigger removal. An uploaded photo abandoned before saving a cake can remain an unused asset.

## Evidence and test results

Screenshot evidence is indexed in [the before/after gallery](admin-fixes-part-2-evidence/README.md). Final command results are recorded below. Browser data comes from a local Supabase-compatible fixture server and, where noted, intercepted summary endpoints. SQL persistence, validation, locks and rollback are exercised against the actual migrations in PGlite. These tests do not constitute a live Supabase, Stripe or SMTP end-to-end deployment certification.

The unchanged source was captured from `ee1866c` in an isolated temporary checkout using the same fixture backend. Original storefront screenshot assertions fail there too: saved images depict different catalogue content and older price presentation. Those existing references were not silently overwritten to turn failures green.

## Remaining limitations

- Four numbered client references are unavailable, so exact visual scope and fidelity remain blocked.
- Inventory CSV import/export and bulk stock editing were not existing supported workflows and have not been introduced. Packing slips are not an existing document type; individual order summary printing and filtered order CSV export are provided.
- Customers still derives its view from a bounded legacy order preload; full Analytics still uses its existing 5,000-row cap and catalogue editing retains its existing full-catalogue loader. The new order/cake histories and inventory do not depend on those limits. These remaining loaders prevent a claim that every admin resource has been completely refactored.
- Database substring search and materialized aggregates are correct at the tested 5,001-row scale. Production query plans and latency with substantially larger histories have not been measured. Indexes support common access and ordering; this is not a production performance benchmark.
- Existing-row updates can change offset page membership. Quote communication history shows the latest 25 revisions, with historical documents and links retained in storage.
- Embedded Noto Sans covers the tested Latin accents, Greek and Cyrillic. Unsupported scripts fail explicitly; HTML printing remains available. PDF logos currently use supported local raster assets with a business branding fallback.
- Whole option-configuration saves are atomic but have no optimistic version check across different admins; concurrent edits can overwrite an earlier option payload. Unsaved-draft guards cover tab, close, link and unload actions; same-page browser Back is not guarded.
- Atomic stock compare-and-set prevents repeated identical stale requests. Real multi-connection PostgreSQL contention/deadlock testing and live external mail/payment transport verification remain deployment checks.
- The full browser regression result includes stale pre-existing storefront snapshot failures. Required fixes discovered in the admin checks are rerun independently and recorded accurately below.

## Modified files

Screenshot artifacts are grouped under the evidence directory rather than listed individually.

## Verification ledger

- `npm run quality`, `npm run typecheck`, `npm run test:css`: passed (58 tokens, zero undefined references).
- `npm test`: 60 files / 241 tests passed, including PDF text extraction, long multi-page content and immutable financial snapshots.
- `npm run test:admin:db`: all five actual migration suites passed, including complete 5,001-record history reachability, stock compare-and-set/audit rollback, publication dependencies and dashboard aggregates.
- `npm run test:db:local`: original commerce/cake migration regression suites passed.
- `npm run build`: production build passed using placeholder isolated service credentials. Build-time fixture setting warnings are not a live database check.
- Order/cake history workflows: seven widths passed. Document composer/download/print workflows: seven widths passed, nine type/design combinations each. Configuration workflows initially passed all seven; visual review then added an explicit overflow assertion and corrected intrinsic fieldset width.
- Full initial browser run: 228 passed, 141 skipped, 30 failed. Twenty-eight failures were old storefront snapshot comparisons; the same four themed comparisons were reproduced on unchanged source at 320px. The two other failures were a document composer width defect and a cake-builder test selector race; both were corrected and rechecked separately. Saved storefront baselines were not changed.
- Authenticated/theme/accessibility and final configuration recheck results are recorded at the end of this ledger.

These are local fixture and migration checks. Production query plans, real Supabase permissions, multi-connection contention and external payment/mail delivery require staging verification.

### Source file inventory

- `.gitignore`
- `db/migrations/0034_admin_history.sql`
- `db/migrations/0035_admin_safe_operations.sql`
- `db/migrations/0036_inventory_pagination.sql`
- `db/migrations/0037_cake_publication.sql`
- `db/migrations/0038_admin_dashboard.sql`
- `docs/admin-fixes-part-2-report.md`
- `docs/admin-fixes-part-2-tracker.md`
- `e2e/admin-audit.spec.ts`
- `e2e/admin-before.spec.ts`
- `e2e/admin-configuration.spec.ts`
- `e2e/admin-documents.spec.ts`
- `e2e/admin-history.spec.ts`
- `e2e/budget-results.spec.ts`
- `e2e/fixture-server.mjs`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `scripts/test-admin-cake-publication.mjs`
- `scripts/test-admin-dashboard.mjs`
- `scripts/test-admin-history.mjs`
- `scripts/test-admin-inventory-pagination.mjs`
- `scripts/test-admin-safe-operations.mjs`
- `src/app/admin.css`
- `src/app/admin/[[...section]]/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/api/admin/cakes/[id]/quote-preview/route.test.ts`
- `src/app/api/admin/cakes/[id]/quote-preview/route.ts`
- `src/app/api/admin/cakes/photo/route.test.ts`
- `src/app/api/admin/cakes/photo/route.ts`
- `src/app/api/admin/documents/[id]/pdf/route.ts`
- `src/app/api/admin/history/[kind]/[identifier]/route.ts`
- `src/app/api/admin/history/[kind]/export/route.ts`
- `src/app/api/admin/history/[kind]/route.test.ts`
- `src/app/api/admin/history/[kind]/route.ts`
- `src/app/api/admin/inventory/adjust/route.ts`
- `src/app/api/admin/inventory/route.ts`
- `src/app/api/admin/mutate/route.test.ts`
- `src/app/api/admin/mutate/route.ts`
- `src/app/api/admin/orders/bulk/route.test.ts`
- `src/app/api/admin/orders/bulk/route.ts`
- `src/app/api/documents/pdf/route.ts`
- `src/app/documents.css`
- `src/components/admin/admin-portal.tsx`
- `src/components/admin/admin-shell.tsx`
- `src/components/admin/cake-types-editor.tsx`
- `src/components/admin/history-workspace.tsx`
- `src/components/admin/inventory-workspace.tsx`
- `src/components/admin/live-sections.tsx`
- `src/components/admin/use-unsaved-changes.ts`
- `src/components/documents/business-document.tsx`
- `src/lib/data/admin-dashboard.test.ts`
- `src/lib/data/admin-dashboard.ts`
- `src/lib/data/admin-history.test.ts`
- `src/lib/data/admin-history.ts`
- `src/lib/data/admin.ts`
- `src/lib/data/catalog.ts`
- `src/lib/documents/cake-quote-preview.ts`
- `src/lib/documents/pdf-renderer.ts`
- `src/lib/documents/pdf.test.ts`
- `src/lib/documents/presentation.ts`
- `src/lib/documents/service.ts`
- `src/validations/cake-type.test.ts`
- `src/validations/cake-type.ts`
- `tsconfig.json`
- `public/fonts/`: Noto Sans regular/bold and OFL license.
- `docs/admin-fixes-part-2-evidence/`: retained before/after PNGs and index.

### Final browser rechecks

The final combined theme, accessibility, authenticated section layout, login and bakery lead-date suite passed **126/126 tests at seven widths** (`admin-verification-final`, 4.1 minutes). Theme geometry was checked for Berry Atelier, Royal Purple and Orange & Yellow; serious/critical accessibility assertions cover the major workspaces in Berry and dashboard/Analytics. This is not an assertion that all themes passed every possible accessibility rule.

A standalone configuration recheck was initially contaminated by concurrent fixture resets, yielding duplicated fixture cake types. Its new 320px overflow assertion passed before that setup failure. The authoritative configuration/history rerun uses one worker and no competing fixture resets; its final result is recorded below.

The final browser commands used `PLAYWRIGHT_ISOLATED_ENVIRONMENT=true`, `NDEE_BROWSER_FIXTURES=true` and `PLAYWRIGHT_BASE_URL=http://localhost:3100` against the local fixture server. The authenticated responsiveness suite also used an isolated signed fixture storage state.

```sh
npx playwright test e2e/admin-audit.spec.ts e2e/responsive.spec.ts e2e/budget-results.spec.ts --grep 'admin|cake type controls' --workers=1
npx playwright test e2e/admin-configuration.spec.ts e2e/admin-history.spec.ts --workers=1
npx playwright test e2e/admin-documents.spec.ts --workers=1
```

The document suite’s last complete run passed seven tests (one per viewport), each exercising all nine document/design combinations and PDF authorization/download/print checks. The retained baseline captures include all seven widths; a baseline document capture interrupted by fixture contention was recaptured sequentially. Synthetic data differs between workflow and document scenarios; the gallery demonstrates interface changes, not production data comparisons.

Final sequential configuration/history rerun: **14/14 passed (1.7 minutes)** across all seven widths. This includes the explicit configuration overflow assertion, persisted option ordering and final finance/inventory screenshots. The retained gallery contains **315 PNGs**. Final quality, typecheck, CSS audit, production build and `git diff --check` passed. Changes remain uncommitted; no production migrations or deployment were performed.

## Authorized database rollout — 2026-10-11

On the user's explicit instruction to apply the migrations, applied **0034–0038** to configured Supabase project `lmgwshcddlgjoanwgqnn` (`postgres` database). Prerequisites 0032/0033 were confirmed and the new admin functions were absent. Saved existing public function definitions in the ignored private backup directory; applied all five migrations in one transaction with lock/statement timeouts and an advisory lock. Service-role grants and anonymous/authenticated restrictions passed. All four read-only history/inventory/dashboard smoke calls passed as `service_role` before commit. Committed successfully and requested PostgREST schema reload. No customer/payment/configuration mutations were invoked by verification.

The receipt records migration SHA-256 checksums and UTC completion time at `.commerce-backups/admin-2026-10-11T06-01-19.993Z/rollout.json`. This rollout supersedes the earlier statement that production migrations were not performed; application deployment remains separate.

Post-commit Supabase API verification also passed: orders history, cake history, inventory pagination and dashboard summary RPCs are available through PostgREST using the configured service role.
