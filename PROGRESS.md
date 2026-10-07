# Project Progress and TODOs

Last updated: 2026-10-07
Active development branch: `commerce/full-implementation`
Latest prior application commit: `b8b126b`
Baseline commit for the premium pass: `9818e17`

This is the living checkpoint for implementation progress. Update it when a feature, migration, test, deployment prerequisite, or known limitation changes. `implementation.md` remains the full product plan and definition of done.

## Current checkpoint

The full commerce specification is implemented on `commerce/full-implementation`, based on reconciled remote main `dde3e06`. Cake base prices and assigned options, explicit pack quantities, postal-code delivery resolution, Halifax fulfilment scheduling, line tax/discount snapshots, quote checkout, and owner configuration controls now share canonical domain logic. See [the verification report](docs/full-commerce-verification.md) and [rollout/recovery instructions](docs/commerce-rollout.md).

Migrations 0030–0031 were previously applied; 0032–0033 are now applied and verified against the configured Supabase database. An encrypted affected-configuration backup was created before application. Transactional write probes were rolled back and owner CMS content was preserved. Verification passes 137 regression tests, 64 API tests, TypeScript, production build, quality, CSS tokens, and local migration/quote-conversion checks. Isolated browser journeys cover five phone widths and owner configuration/marketing exports. An actual Stripe test Checkout matched the recorded CAD 45.60 total and was expired without collecting payment.

Production remains **NOT READY**: the live database has no active priced cake types/assignments, covered postal areas, structured schedule, or selected delivery-tax mode; eight active products need tax review and fourteen active variants lack pack counts. Owner-approved values, an authorized isolated database workflow run, and a paid Stripe/webhook journey remain pending. No production deployment or merge to main is performed until those acceptance gates are complete.

Customer wording controls now cover the previously fixed labels and customer emails, with searchable screen groups in Admin → Content. Real admin save/reload/public rendering, local SMTP capture and phone/desktop checks passed; test edits were restored and temporary sessions revoked. See [the wording report](docs/customer-wording.md). Immutable test audit records were retained after automatic approval review rejected deletion. This does not change production launch readiness.

The owner workflow repairs are committed and verified: repeat editing of delivery areas/coupons, working marketing previews and PNG/ZIP downloads, carousel photo navigation to product details, readable quote payment layout, automatically refreshed quote-email status, single-source WhatsApp links in customer pages/emails/PDFs and full product-edit access from inventory. The public canonical/marketing URL is https://www.ndeelicious.com. See [the owner workflow verification report](docs/owner-workflow-fixes.md). Verification passed 113 regression and 58 API tests, TypeScript/build/quality/CSS checks, 28 authenticated admin checks and the real browser workflow smoke. Send quote delivered only to a local TLS mail sink; the accepted quote created a Stripe test Checkout with the correct area fee. Tagged fixtures, sessions and limiter records were removed, carousel settings restored, unrelated owner records retained, and no real payment or external email occurred. Deployment and real inbox/paid journeys remain open.

The stockist update passed the full 110-regression/58-functional project gate, 56 final visual/accessibility browser checks and mobile/link smoke checks. The regenerated PDF has ten pages.

The owner supplied an additional Instagram business post identifying frozen Nigerian-style meat pies, chicken pies and beef sausage rolls, plus four stockists in Halifax/Dartmouth. These product descriptions are now included in storefront copy and the regenerated policy pack. The ready-to-bake page links to Kalisimbi Shop, Iyalode African Wholesales Market, Chater Meat Market and Wazobia African Shop. Current stock/prices/hours are referred to each retailer; bakery delivery coverage and cake-only cancellation rules remain separate. Only business/content settings were updated with a private backup; existing catalogue and financial records were preserved.

The owner-approved Merchant policy pack and Halifax business profile are implemented. Wedding cake cancellations require one calendar month notice; other cakes require seven days. Customer cancellation/change-of-mind payments are non-refundable, with mandatory consumer remedies preserved. The five policy documents and nine-page PDF are in [the Merchant documentation folder](docs/merchant-center/README.md). Only existing business/content database settings were updated, with a private pre-update backup; catalogue, inventory and financial records were preserved. City/province/timezone now use Halifax, NS and America/Halifax, and the storefront describes custom cakes and frozen, ready-to-bake Nigerian-style pies using the supplied food-safety statement.

Merchant update verification: `npm run check` passed **110 regression / 58 functional tests**, TypeScript, quality, CSS tokens and production build. The final visual/accessibility browser run passed **56 checks** across seven viewports and four themes. Seven public pages, checkout policy links and the printable document bundle passed content/mobile smoke checks. Actual delivery areas/rates/times, live domain verification and genuine catalogue details remain prerequisites for Merchant submission; no submission or deployment was performed.

Production closure remains **NOT READY**. Remote main `b1d106a` was safely merged into local develop at `8a5301a` before creating the closure branch; existing uncommitted work was preserved. No open PRs were found. Remote application CI still needs a new passing run, and scheduled notifications fail because their GitHub production secrets are empty. See [the production closure audit](docs/production-closure.md) for exact branch SHAs, environment requirements and remaining risks.

On the owner-authorized configured test database, corrected migration `0027` was applied after rollback verification; counts and content hashes for every pre-existing public table were unchanged. The migration closes a reproduced forged-custom-cake inventory bypass and validates linked status on insert/link changes. The expanded rollback suite passed **27 checks**. A separate true two-connection stock race passed with one winner/one rejection and cleanup of its disposable orders/items/reservations. Order count returned to zero, catalogue stock was unchanged, and temporary browser admin sessions/storage files were removed. No Stripe charge or SMTP message was sent.

Production closure verification before the Merchant policy update: `npm run check` passed **108 regression / 58 functional tests**, quality, the 58-token CSS audit, TypeScript and the production build. Full public Playwright passed **167**, skipped **134**; authenticated admin passed **28/28** after fixing a reproduced 320px custom-cake workspace overflow. Stripe test API and SMTP authentication passed read-only verification. Complete paid browser journeys, true quote/document/refund races, durable delivery recovery, production deployment configuration and real devices remain open. Structured logs now omit raw provider messages; browser target safety and SMTP rejected-recipient handling have regression coverage.

The final staged-file check includes newly tracked files that incremental checks had skipped. Two analytics accessibility lint defects and five formatting discrepancies were corrected; the subsequent canonical gate and authenticated 28-check rerun passed. A separate build without `.env.local` passed. The final telemetry-suppressed browser smoke passed seven checks (two admin checks skipped without credentials). All 63 synthetic events from earlier browser runs were removed, preserving the 22 pre-session analytics records with the same content hash. Final read-only verification found zero orders, the original ten admin sessions, zero legacy Supabase Auth sessions and no retained public limiter rows.

The premium UX/system-simplicity pass is implemented through its application and database layers. Theme resolution, carousel agency/availability, maximum-budget discovery, persisted official documents, accepted-quote checkout, and the independent Marketing studio now share canonical domain helpers instead of duplicating financial or availability logic.

Migrations `0022` through `0026` are additive and have been applied to the currently configured Supabase database. Browser E2E remains intentionally open until isolated Supabase/Stripe services and a browser harness are configured; production services must not be used for destructive automated journeys.

Migration `0027_workflow_integrity.sql` is corrected, applied and rollback-verified in the configured owner-authorized test database as of 2026-10-05. It still needs repeat verification in any separate staging/production environment. Durable SMTP delivery and lease recovery remain unverified end to end.

The initial full-stack application is committed on `main`. Development work preserved on the current closure branch adds:

- Provider-neutral SMTP transactional email through Gmail-compatible STARTTLS, app-password, or OAuth2 credentials.
- Customer emails for orders, cake requests, and newsletter sign-ups.
- Admin emails for new orders, cake requests, and contact messages when `ADMIN_EMAIL` is configured.
- Environment-aware canonical URLs for metadata, `robots.txt`, and `sitemap.xml`.
- A GitHub Actions pipeline split into regression, functional, and structural gates, with opt-in Vercel staging and production deployment.
- Incremental Biome linting and formatting for every changed file, locally and in CI.
- A clean full-repository Biome lint baseline; the former 82-error/141-warning backlog is resolved.

The Canada commerce, owner-managed storefront settings, complete order lifecycle, immutable admin audit ledger, search/social metadata, analytics, monitoring foundations, performance pass, and accessibility pass are implemented. The active implementation checkpoint is now **G15 · Security and test depth**.

The first-party admin OTP/SMTP security remediation is implemented and verified locally. Migrations `0003` through `0017` are applied to the project's configured Supabase database. Deployment remains blocked on production environment configuration and revocation of legacy Supabase Auth sessions.

G13 is complete at the application and configured-database layers: the dashboard includes a concise 30-day business pulse, the dedicated Analytics workspace progressively exposes financial, customer, product, cake, promotion, fulfilment, inventory, and operational calculations, and structured server error logging is wired through Next.js instrumentation and critical commerce boundaries. Migration `0028_privacy_analytics.sql` was transactionally verified and applied to the currently configured Supabase database; a live application-API event was stored with privacy-safe metadata and then removed.

G14 is complete at the application layer. Public storefront data now uses a five-minute server cache with immediate invalidation after owner mutations, the home LCP image has an exact 1440px candidate and high fetch priority, critical shells include keyboard skip links, and data visualizations have text alternatives. The responsive/axe suite passed at 320px and desktop, and a cache-warm production build under 4G plus 4× CPU throttling measured mobile LCP 0.77s / INP-style interaction latency 152ms / CLS 0 and desktop LCP 2.07s / CLS 0. Authenticated admin and field Core Web Vitals verification remain staging-environment checks under G16.

G15 is active. Durable database-backed abuse protection now covers the public submission, quote, order, tracking, payment-status, document, review, and analytics endpoints. Requester identifiers are HMAC fingerprints rather than stored IP addresses, the limiter is atomic across application instances, and it fails closed when its database dependency is unavailable. Baseline browser security headers are enabled globally, Next.js is patched to 16.3.8, and the production dependency audit reports zero known vulnerabilities. Database integration suites, full browser abuse journeys, and remaining concurrency/payment edge cases are still open.

## Implemented

- [x] Added a complete semantic theme resolver for Berry, Purple, Sunrise, and arbitrary custom colours, including automatic contrast-safe foregrounds and centralized CSS variables.
- [x] Added shared product/variant availability rules and used them in carousel, budget, product card, and cart paths so multi-variant products never silently add the wrong variant.
- [x] Reworked carousel autoplay, manual pause, reduced-motion, touch swipe, announcements, 44px controls, advanced settings, and persistent publish state.
- [x] Changed Budget Match to true maximum-spend semantics with live rounded presets, transparent catalogue filters, zero-result recovery, segmented results, canonical cake pricing, and stable option-ID deep links.
- [x] Integrated Budget Match into the catalogue filter sidebar and expanded cake discovery into three calculated spend levels, with four visible suggestions per desktop row and horizontally scrollable overflow.
- [x] Added persisted immutable quote/invoice/receipt snapshots, append-only document events, opaque hashed/revocable access tokens, private/no-store document responses, read-only official financial fields, and deterministic server-generated PDFs from the shared document DTO.
- [x] Added atomic quote responses and quote-to-order conversion, linked custom-cake order lifecycle, server-side Canada delivery/tax calculation, final-total review, and Stripe handoff through the existing payment infrastructure.
- [x] Separated Marketing from homepage carousel merchandising, enabled all-active-product selection, brand-aware exports, editable captions, Story safe-zone preview, centralized logo setting, and one-ZIP bulk PNG downloads.
- [x] Made newly added nested Budget Match copy fields backward-compatible with individually applied validation defaults, preventing older content records from producing runtime Zod errors.
- [x] Wired budget zero-result recovery into the catalogue and made presets, budget matches, closest alternatives, and “Available now” use the same purchasable-product rule.
- [x] Replaced the fixed 48-line document PDF with a visually verified, branded, wrapped, multi-page table renderer; saved document layouts, accents, notes, and visibility options now drive downloads and customer copies.
- [x] Added durable custom-cake quote delivery state with queued/sent/failed visibility, admin retry, interrupted-delivery lease recovery, and status changes only after SMTP succeeds.
- [x] Made linked order status authoritative for custom cakes and allowed only explicitly marked custom-cake lines to bypass catalogue inventory reservation.
- [x] Added database-derived admin analytics with rolling comparisons, decision-oriented insights, privacy-preserving aggregate customer reporting, and a concise dashboard summary.
- [x] Added allow-listed anonymous commerce events that respect Global Privacy Control and never store names, emails, addresses, payment details, or search text.
- [x] Added structured server error logging through Next.js request instrumentation and critical admin, order, analytics, and Stripe boundaries.
- [x] Added short-lived, explicitly invalidated storefront data caching, responsive image candidates, keyboard skip links, chart text alternatives, and authenticated admin axe coverage.
- [x] Added atomic multi-instance public-endpoint rate limiting with privacy-safe requester fingerprints, `429` retry guidance, fail-closed behavior, and service-role-only database access.
- [x] Added global CSP, permissions, referrer, HSTS, MIME-sniffing, and frame-denial headers; upgraded Next.js to the patched 16.3.8 release.

- [x] Next.js App Router storefront and shared layout.
- [x] Product catalogue, category pages, product details, cart, and local cart state.
- [x] Custom cake builder and server-side quote calculation.
- [x] Checkout quote calculation, delivery zones, coupons, and order creation route.
- [x] Order tracking interface and route.
- [x] Supabase schema migrations, server/client access, seed script, and admin bootstrap script.
- [x] First-party admin OTP authentication with hashed one-time challenges, durable rate limits, opaque revocable sessions, protected admin shell, and protected mutation routes.
- [x] Contact and newsletter persistence routes.
- [x] Error, loading, not-found, policy, delivery, FAQ, and about pages.
- [x] Unit tests for checkout pricing, cake pricing, inventory rules, formatting, validation, and auth helpers.
- [x] Functional route tests for cake and checkout quotes.
- [x] Metadata, sitemap, and robots route foundations.
- [x] Transactional email integration implemented in the working tree.
- [x] Transactional email provider, HTML escaping, and canonical site URL tests.
- [x] Functional notification tests for orders, cake requests, contact messages, and newsletter sign-ups.
- [x] CI gates for regression, functional, and structural tests.
- [x] Opt-in CD jobs for Vercel staging from `develop` and production from `main`.
- [x] Complete product create/edit/archive/duplicate flows with category, price, stock, visibility, and featured controls.
- [x] Product variant management with inactive-row preservation for historical order integrity.
- [x] Product image upload, required alt text, ordering, storefront gallery use, and storage/RLS migration.
- [x] Storefront catalogue visibility now respects an empty live catalogue instead of exposing fallback products after archival.
- [x] Removed the Supabase Auth magic-link/PKCE dependency from admin authentication so login codes no longer enter redirect URLs.
- [x] Added service-role-only `admin_otp_challenges` and `admin_sessions` tables in migration `0004_admin_otp_sessions.sql`.
- [x] Replaced process-local OTP throttling with database-backed recipient and requester limits suitable for multiple application instances.
- [x] Replaced Resend-specific delivery code with a server-owned SMTP mail engine shared by admin OTP and customer notifications.
- [x] Added transactional, expiring inventory reservations with payment-stage deduction, cancellation/refund restoration, protected admin adjustments, and database row locking against concurrent overselling.
- [x] Removed runtime catalogue, coupon, review, and editorial demo fallbacks; customer-facing content now comes from Supabase records or presents an explicit empty state.
- [x] Added database-managed business/storefront content, cake options and lead time, approved review display and submission, and functional admin editors.
- [x] Added private validated cake-inspiration uploads with signed admin previews.
- [x] Replaced the coupon draft-only control with persisted coupon editing, activation windows, monetary/percentage rules, total limits, and per-customer limits.
- [x] Added store-wide and delivery-zone minimums, delivery/pickup availability controls, ordered delivery-zone administration, product/category coupon eligibility, and concurrency-safe expiring coupon holds.
- [x] Added server-owned Stripe Checkout sessions, persisted payment attempts, signed webhook verification, atomic and idempotent payment transitions, payment-status polling, and safe payment resume/retry flows.
- [x] Converted checkout, order snapshots, Stripe currency, customer/admin formatting, address collection, and transactional copy to Canadian settings with province, postal-code, timezone, and configurable tax support.
- [x] Added runtime-validated business, storefront-content, and appearance settings; the admin can edit every stored storefront text/link/list and choose safe theme colours, width, spacing, corner, and product-grid controls without code changes.
- [x] Enforced the order status graph in PostgreSQL, added immutable order activity, detailed admin order inspection/printing/notes, idempotent full and partial Stripe refunds, refund concurrency protection, and durable customer-notification delivery with retry controls.
- [x] Added an immutable service-role-only admin audit ledger with validated actor/session identity, server-read before/after values for sensitive mutations, and an authorized Audit Log screen.
- [x] Made every product variant a SKU-bearing inventory unit with database-generated immutable identifiers, variant-level admin adjustments, derived product totals, and SKU snapshots on order lines.
- [x] Reworked the owner-facing Delivery, Inventory, Products, Audit Log, Custom Cakes, Settings, and Website Text workspaces for responsive task-focused use; added custom-cake workflow status management and grouped database-backed option editing.

## Verification status

Verified on 2026-10-02 after the responsive-system CI stabilization:

- `npm run check` — quality, CSS token audit, 93 regression tests, 55 functional tests, strict TypeScript, and the 46-route production build passed.
- A clean production build with no `.env.local` passed after marking database-backed root metadata and layout rendering as request-time work.
- The formerly flaky custom-cake builder overflow check passed 21 consecutive runs across all seven configured Playwright viewports.
- GitHub scheduled notifications still require repository/environment secrets `PRODUCTION_SITE_URL` and `CRON_SECRET`; the workflow exits before dispatch while they are unset.
- G13 application verification — CSS token and quality checks, 96 regression tests, 57 functional tests, strict TypeScript, and the 47-route production build passed.
- Migration `0028_privacy_analytics.sql` was rollback-verified and applied on 2026-10-02. RLS was enabled, `service_role` insert was allowed, `anon` insert was denied, and a live `/api/analytics/events` request returned 204, persisted the allow-listed event, and was cleaned up.
- G14 browser verification — 47 public responsive, interaction, visual-theme, reduced-motion, and axe checks passed at 320px and desktop; 35 environment-gated tokenized/admin checks skipped as designed.
- G14 throttled production lab — cache-warm mobile measured LCP 0.77s, interaction latency 152ms, and CLS 0; desktop measured LCP 2.07s and CLS 0. Production field metrics remain a launch/staging verification item.
- G15 security verification — migration `0029_public_rate_limits.sql` passed rollback-only atomic limit and role checks, was applied to the configured database, and a live route check returned 120 expected validation responses followed by one `429`; its exact verification row was then removed.
- G15 local gate — `npm run check` passed on Next.js 16.3.8 with 99 regression tests, 58 functional tests, strict TypeScript, and the 47-route production build. `npm audit --omit=dev` reports zero known vulnerabilities.
- G15 production-header smoke check — `/admin/login` returned the configured Content Security Policy, Permissions Policy, Referrer Policy, HSTS, `nosniff`, and frame-denial headers.

Verified locally on 2026-09-19 before introducing the CI files:

- `npm run typecheck` — passed.
- `npm test` — 9 files and 27 tests passed.
- `npm run build` — passed; 43 routes/pages generated.

Checkpoint verification history:

- Workflow-integrity verification — 88 regression tests, 55 functional tests, strict TypeScript, quality checks, and the 46-route production build passed after the budget, quote-payment, document, and quote-delivery corrections on 2026-09-27. The PDF was also visually checked as a branded two-page invoice.
- SEO verification — 84 regression tests, 52 functional tests, strict TypeScript, quality checks, and the 46-route production build passed after the canonical metadata and structured-data pass on 2026-09-27.
- Migrations `0022_carousel_safe_timing.sql`, `0023_budget_maximum_copy.sql`, `0024_persisted_business_documents.sql`, `0025_marketing_export_settings.sql`, and `0026_quote_order_conversion.sql` were transactionally applied to the configured Supabase environment.

- `npm run test:regression` — 9 files and 29 tests passed.
- `npm run test:functional` — 5 files and 9 tests passed.
- `npm run test:structural` — route type generation, strict TypeScript, and the 43-route production build passed.
- `npm run quality` — 16 changed files passed linting and formatting checks.
- `biome lint . --max-diagnostics=200` — all 116 tracked source/config files passed with no lint errors or warnings.
- `npm test` — 14 files and 38 tests passed after the lint remediation.
- `npm run typecheck` — Next.js route generation and strict TypeScript passed after the lint remediation.
- `npm run build` — production compilation and all 43 routes/pages passed after the lint remediation.
- `npm run check` — 33 regression tests, 16 functional tests, strict TypeScript, and the 44-route production build passed for G02.
- `npm run check` — 34 regression tests, 20 functional tests, strict TypeScript, and the 44-route production build passed after the first-party OTP/SMTP security migration on 2026-09-20.
- `npm run check` — 40 regression tests, 24 functional tests, strict TypeScript, and the 44-route production build passed for G03 on 2026-09-23.
- `npm run check` — 40 regression tests, 28 functional tests, strict TypeScript, and the 37-page production build passed after the database-backed storefront sweep on 2026-09-23.
- `npm run check` — 43 regression tests, 34 functional tests, strict TypeScript, and the 37-page production build passed for G06 on 2026-09-24.
- `npm run check` — 45 regression tests, 40 functional tests, strict TypeScript, and the 40-page production build passed for G07 on 2026-09-24.
- `npm run check` — 48 regression tests, 43 functional tests, strict TypeScript, and the 40-page production build passed after the Canada commerce and owner-managed settings foundation on 2026-09-24.
- `npm run check` — 49 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed for G08 on 2026-09-24.
- `npm run check` — 53 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed for G11 on 2026-09-25.
- `npm run check` — 54 regression tests, 47 functional tests, strict TypeScript, and the 40-page production build passed after inventory-unit SKU automation on 2026-09-25.
- `npm run check` — 54 regression tests, 48 functional tests, strict TypeScript, and the 40-page production build passed after the owner-facing admin usability pass on 2026-09-25.
- Migration `0005_inventory_integrity.sql` was transactionally validated and applied to the configured Supabase database on 2026-09-23; rollback-only lifecycle checks and a live two-connection race confirmed one winner, one rejected reservation, zero oversales, correct deduction/restoration, RLS, triggers, and role restrictions.
- Migrations `0006_database_backed_storefront.sql`, `0007_cake_reference_images.sql`, and `0008_additive_storefront_content.sql` are applied to the configured Supabase database. The latter is additive and preserves content already customized in admin.
- Migration `0003_product_media.sql` was applied to the configured Supabase database on 2026-09-23 after a runtime REST query exposed the missing `product_images.storage_path` column; the content record and column were then verified through Supabase REST.
- Migration `0009_delivery_coupon_integrity.sql` was rollback-validated and applied on 2026-09-24. Live two-connection races confirmed one winner/one rejection for both global and per-customer coupon limits; paid orders committed holds and cancellation released them.
- Migration `0010_stripe_payments.sql` was rollback-validated and applied on 2026-09-24. A rollback-only live database test confirmed amount-tampering rejection, duplicate-event idempotency, exactly-once stock deduction, paid order/payment transitions, and service-role RPC grants.
- Migration `0011_canada_commerce_settings.sql` was rollback-validated, applied, and live-verified on 2026-09-24. Business settings now use CA/CAD defaults, Canadian address and tax snapshots exist, appearance settings are database-owned, and legacy Nigerian delivery zones are inactive.
- Migrations `0012_order_lifecycle.sql`, `0013_notification_outbox_leases.sql`, and `0014_refund_concurrency.sql` were rollback-validated and applied on 2026-09-24. Live transactional checks rejected invalid status jumps, proved order-event immutability/admin attribution, completed an atomic full refund, queued the refund email, and prevented pending concurrent refunds from exceeding the paid amount.
- Migration `0015_async_refund_events.sql` was rollback-validated and applied on 2026-09-24. A live rollback-only check confirmed pending provider refunds are not completed early and duplicate signed refund webhooks finalize the order exactly once.
- Migration `0016_admin_audit_logs.sql` was rollback-validated and applied on 2026-09-25. A live rollback-only check confirmed active admin/session attribution and append-only enforcement without retaining test rows or sessions.
- Migration `0017_inventory_unit_skus.sql` was rollback-validated and applied on 2026-09-25. It backfilled 13 variant SKUs, reconciled five product/variant stock mismatches with no active reservations, and passed rollback-only generation, immutability, aggregation, adjustment, and service-role permission checks.
- A read-only readiness check on 2026-09-25 found one active bootstrapped first-party admin, zero active first-party admin sessions, one legacy Supabase Auth user, and zero legacy Supabase Auth sessions in the currently configured environment.
- Runtime smoke checks returned HTTP 200 for the homepage, checkout, delivery information, and admin login against the running development server.
- Runtime smoke checks returned HTTP 200 for the homepage, shop, checkout, and delivery information with no Nigerian locale/currency copy in their rendered HTML; unauthenticated admin access correctly redirected to login.

CI command ownership:

- Regression: `npm run test:regression` (domain, validation, and library tests).
- Functional: `npm run test:functional` (route-handler behavior).
- Structural: `npm run test:structural` (Next.js route type generation, strict TypeScript, and production build).
- Full local gate: `npm run check`.

## TODO — immediate

- [x] Apply corrected `db/migrations/0027_workflow_integrity.sql` to the owner-authorized configured test environment and run 27 rollback workflow checks plus a true stock reservation race with cleanup.
- [ ] Repeat 0027 verification in separate staging/production and prove durable quote-email retry/lease recovery with a safe mail sink.
- [x] Apply `db/migrations/0028_privacy_analytics.sql` to the currently configured database and verify privacy-safe anonymous event ingestion. Repeat when isolated staging and any separate production database are created.
- [x] Apply `db/migrations/0029_public_rate_limits.sql` to the currently configured database and verify atomic enforcement, RLS/role restrictions, and an application-level `429`. Repeat for isolated staging and any separate production database.
- [ ] Configure isolated browser-test Supabase and Stripe services, then add the Phase 7 Playwright journeys for themes, mobile, reduced motion, carousel, budget, quote/payment, and immutable receipt workflows.
- [x] Add admin email and copy-secure-link controls for issued invoices and receipts; generated links create new revocable opaque access tokens.
- [ ] Add live database integration tests for document immutability, revoked/expired access, revision races, and concurrent quote conversion. Unit/functional coverage is present, but production Supabase is intentionally not used as an automated destructive test target.

- [x] Review and format the transactional-email route changes.
- [x] Add unit tests for HTML escaping, provider failure, and missing email configuration.
- [x] Add functional tests for order creation, cake requests, contact submission, and newsletter subscription.
- [x] Apply `db/migrations/0004_admin_otp_sessions.sql` to the project's Supabase database and verify RLS plus role revocations.
- [x] Apply `db/migrations/0005_inventory_integrity.sql` and verify reservation, concurrency, deduction, restoration, RLS, triggers, and role restrictions.
- [ ] Configure a unique 32+ character `ADMIN_AUTH_SECRET` in each environment; never expose it through a `NEXT_PUBLIC_` variable.
- [ ] Configure `SMTP_USER`, a Gmail app password or OAuth2 credentials, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` in each environment.
- [ ] Run `npm run admin:bootstrap` in each intended environment after its variables and migration are ready.
- [ ] Globally revoke existing Supabase Auth admin sessions and correct the Supabase Auth Site URL to an absolute `https://...` URL until every old deployment is retired.
- [ ] Configure GitHub/Vercel deployment values, then set repository variable `VERCEL_CD_ENABLED=true`.
- [ ] Configure GitHub production secrets `PRODUCTION_SITE_URL` and `CRON_SECRET` so the scheduled notification workflow can dispatch successfully.
- [ ] Subscribe each Stripe webhook endpoint to `refund.created`, `refund.updated`, and `refund.failed` in addition to the Checkout Session events before enabling live refunds.
- [ ] Add branch protection for `main` and `develop`, requiring all four CI jobs.
- [x] Apply `db/migrations/0003_product_media.sql` to the currently configured Supabase environment before deploying G02 image management.
- [x] Commit and push the preserved email/SEO work plus the pipeline after review.

## Ordered implementation gap register

Complete these checkpoints in order unless a newly discovered dependency requires reordering. A checkbox is complete only when the relevant `implementation.md` acceptance criteria are met, not merely when a page or database table exists.

- [x] **G01 · Phase 1 — Foundation quality:** add linting and incremental formatting enforcement to local scripts and CI.
- [x] **G02 · Phase 5 — Product management:** complete product editing, duplication, variants, image management, visibility, and featured controls.
- [x] **G03 · Phase 6 — Inventory integrity:** add transactional stock reservation/deduction/restoration and concurrent overselling protection.
- [x] **G04 · Phase 13 — Cake configuration:** move cake options and lead-time rules to admin-controlled data.
- [x] **G05 · Phase 13 — Cake uploads:** securely store and validate cake inspiration images.
- [x] **G06 · Phases 14–16 — Delivery and coupons:** complete minimum-order rules, coupon administration, and per-customer usage limits.
- [x] **G07 · Phase 17 — Stripe:** create server-owned payments, verified idempotent webhooks, and safe retry/failure flows.
- [x] **G08 · Phases 18–20 — Order lifecycle:** complete admin order operations, refunds, status notifications, and immutable lifecycle handling.
- [x] **G09 · Phase 21 — Reviews:** replace placeholder reviews with persisted submission, moderation, and approved public display.
- [x] **G10 · Phases 22–23 — Content and settings:** make saved admin content and centralized business settings drive the storefront.
- [x] **G11 · Phase 24 — Audit logging:** record sensitive admin changes with before/after values and actor identity.
- [x] **G12 · Phase 25 — SEO:** add Twitter metadata and Product, Organization, and Breadcrumb structured data.
- [x] **G13 · Phase 26 — Analytics and monitoring:** add privacy-conscious commerce events, error monitoring, and structured operational logs.
- [x] **G14 · Phases 27–28 — Performance and accessibility:** measure targets, fix material issues, and automate critical accessibility checks.
- [ ] **G15 · Phases 29–30 — Security and test depth:** add durable public-endpoint abuse protection, database integration tests, browser E2E, and concurrency/payment edge cases.
- [ ] **G16 · Phase 31 — Staging:** configure and validate isolated staging services and full customer/admin journeys.
- [ ] **G17 · Phase 32 — Production content:** replace fallback products, placeholder images, contact details, policies, and delivery data.
- [ ] **G18 · Phase 33 — Production launch:** complete the launch, rollback, backup, domain, SSL, monitoring, and final QA checklist.

## TODO — commerce-critical

- [x] Implement Stripe Checkout/payment intent creation.
- [x] Implement and verify signed Stripe webhooks.
- [x] Make payment/order processing idempotent.
- [x] Deduct and restore inventory transactionally after payment/refund events.
- [x] Prevent overselling under concurrent checkouts.
- [x] Add customer-facing payment failure and retry states.
- [x] Complete admin order status transitions and customer status notifications.
- [x] Add image upload/storage for products and cake references.

## TODO — test coverage

- [ ] Add integration tests against an isolated Supabase test project or local database.
- [ ] Add browser E2E coverage for homepage, catalogue, product, cart, checkout, cake builder, and order tracking.
- [ ] Add browser E2E coverage for admin login, products, inventory, coupons, and order processing.
- [x] Add Stripe webhook, duplicate event, delayed event, and failed-payment tests.
- [x] Add coupon expiry, usage-limit, minimum-order, eligibility, per-customer, and out-of-stock race-condition tests.
- [x] Add accessibility checks for critical customer and admin journeys; the broader end-to-end workflow suite remains open.
- [x] Add an incremental lint/format policy and CI check for every changed file.
- [x] Resolve the pre-existing full-repository Biome lint backlog (82 errors and 141 warnings).
- [ ] Normalize untouched legacy formatting incrementally when those files enter an implementation checkpoint.

## TODO — production readiness

- [ ] Create and validate separate development, staging, and production Supabase/Stripe/SMTP environments.
- [ ] Enter owner-approved business contact details, catalogue records, imagery, policy dates, and final editorial copy through admin before launch; runtime fallbacks have been removed.
- [ ] Confirm the owner-approved province, timezone, delivery areas, tax registration/rates, and CAD catalogue prices in admin before accepting live orders; migration defaults intentionally do not invent these business facts.
- [x] Add analytics, error monitoring, and structured logs.
- [x] Review rate limiting for a multi-instance production deployment.
- [x] Add durable abuse protection for public contact, newsletter, cake-request, order, quote, tracking, payment, review, document, and analytics endpoints.
- [ ] Complete security, privacy, accessibility, and performance audits.
- [ ] Run database migrations and seed only the intended environment.
- [ ] Perform the full customer and admin regression checklist from `implementation.md`.
- [ ] Document rollback, backup, and incident-response procedures.

## CI/CD setup notes

CI runs automatically for pushes and pull requests targeting `develop` or `main`.

Deployment is intentionally disabled until the repository is connected to the correct Vercel project. Add these GitHub Actions settings:

- Repository variable `VERCEL_CD_ENABLED`: set to `true` to enable deployments.
- Repository variable `VERCEL_ORG_ID`: the Vercel team/account ID.
- Repository variable `VERCEL_PROJECT_ID`: the Vercel project ID.
- Repository secret `VERCEL_TOKEN`: a token with access to that project.

`develop` deploys to the GitHub `staging` environment. `main` deploys to the `production` environment. Both deployment jobs require all regression, functional, and structural checks to pass first.

## Checkpoint protocol

For each meaningful work session, update:

1. The “Last updated” date and current checkpoint.
2. Completed checkboxes and newly discovered TODOs.
3. Tests run and their result.
4. Database/environment changes.
5. Known limitations and the next recommended task.
