# Project Progress and TODOs

Last updated: 2026-09-23
Active development branch: `develop`
Baseline commit: `fc769b6` (`the initial push`)

This is the living checkpoint for implementation progress. Update it when a feature, migration, test, deployment prerequisite, or known limitation changes. `implementation.md` remains the full product plan and definition of done.

## Current checkpoint

The initial full-stack application is committed on `main`. The current `develop` branch adds:

- Provider-neutral SMTP transactional email through Gmail-compatible STARTTLS, app-password, or OAuth2 credentials.
- Customer emails for orders, cake requests, and newsletter sign-ups.
- Admin emails for new orders, cake requests, and contact messages when `ADMIN_EMAIL` is configured.
- Environment-aware canonical URLs for metadata, `robots.txt`, and `sitemap.xml`.
- A GitHub Actions pipeline split into regression, functional, and structural gates, with opt-in Vercel staging and production deployment.
- Incremental Biome linting and formatting for every changed file, locally and in CI.
- A clean full-repository Biome lint baseline; the former 82-error/141-warning backlog is resolved.

The active implementation checkpoint is now **G04 · Admin-controlled cake configuration**.

The first-party admin OTP/SMTP security remediation is implemented and verified locally. Migrations `0004` and `0005` are applied to the project's single Supabase database. Deployment remains blocked on production environment configuration and revocation of legacy Supabase Auth sessions.

## Implemented

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

## Verification status

Verified locally on 2026-09-19 before introducing the CI files:

- `npm run typecheck` — passed.
- `npm test` — 9 files and 27 tests passed.
- `npm run build` — passed; 43 routes/pages generated.

Checkpoint verification history:

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
- Migration `0005_inventory_integrity.sql` was transactionally validated and applied to the configured Supabase database on 2026-09-23; rollback-only lifecycle checks and a live two-connection race confirmed one winner, one rejected reservation, zero oversales, correct deduction/restoration, RLS, triggers, and role restrictions.

CI command ownership:

- Regression: `npm run test:regression` (domain, validation, and library tests).
- Functional: `npm run test:functional` (route-handler behavior).
- Structural: `npm run test:structural` (Next.js route type generation, strict TypeScript, and production build).
- Full local gate: `npm run check`.

## TODO — immediate

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
- [ ] Add branch protection for `main` and `develop`, requiring all four CI jobs.
- [ ] Apply `db/migrations/0003_product_media.sql` to each Supabase environment before deploying G02 image management.
- [x] Commit and push the preserved email/SEO work plus the pipeline after review.

## Ordered implementation gap register

Complete these checkpoints in order unless a newly discovered dependency requires reordering. A checkbox is complete only when the relevant `implementation.md` acceptance criteria are met, not merely when a page or database table exists.

- [x] **G01 · Phase 1 — Foundation quality:** add linting and incremental formatting enforcement to local scripts and CI.
- [x] **G02 · Phase 5 — Product management:** complete product editing, duplication, variants, image management, visibility, and featured controls.
- [x] **G03 · Phase 6 — Inventory integrity:** add transactional stock reservation/deduction/restoration and concurrent overselling protection.
- [ ] **G04 · Phase 13 — Cake configuration:** move cake options and lead-time rules to admin-controlled data.
- [ ] **G05 · Phase 13 — Cake uploads:** securely store and validate cake inspiration images.
- [ ] **G06 · Phases 14–16 — Delivery and coupons:** complete minimum-order rules, coupon administration, and per-customer usage limits.
- [ ] **G07 · Phase 17 — Stripe:** create server-owned payments, verified idempotent webhooks, and safe retry/failure flows.
- [ ] **G08 · Phases 18–20 — Order lifecycle:** complete admin order operations, refunds, status notifications, and immutable lifecycle handling.
- [ ] **G09 · Phase 21 — Reviews:** replace placeholder reviews with persisted submission, moderation, and approved public display.
- [ ] **G10 · Phases 22–23 — Content and settings:** make saved admin content and centralized business settings drive the storefront.
- [ ] **G11 · Phase 24 — Audit logging:** record sensitive admin changes with before/after values and actor identity.
- [ ] **G12 · Phase 25 — SEO:** add Twitter metadata and Product, Organization, and Breadcrumb structured data.
- [ ] **G13 · Phase 26 — Analytics and monitoring:** add privacy-conscious commerce events, error monitoring, and structured operational logs.
- [ ] **G14 · Phases 27–28 — Performance and accessibility:** measure targets, fix material issues, and automate critical accessibility checks.
- [ ] **G15 · Phases 29–30 — Security and test depth:** add durable public-endpoint abuse protection, database integration tests, browser E2E, and concurrency/payment edge cases.
- [ ] **G16 · Phase 31 — Staging:** configure and validate isolated staging services and full customer/admin journeys.
- [ ] **G17 · Phase 32 — Production content:** replace fallback products, placeholder images, contact details, policies, and delivery data.
- [ ] **G18 · Phase 33 — Production launch:** complete the launch, rollback, backup, domain, SSL, monitoring, and final QA checklist.

## TODO — commerce-critical

- [ ] Implement Stripe Checkout/payment intent creation.
- [ ] Implement and verify signed Stripe webhooks.
- [ ] Make payment/order processing idempotent.
- [x] Deduct and restore inventory transactionally after payment/refund events.
- [x] Prevent overselling under concurrent checkouts.
- [ ] Add customer-facing payment failure and retry states.
- [ ] Complete admin order status transitions and customer status notifications.
- [ ] Add image upload/storage for products and cake references.

## TODO — test coverage

- [ ] Add integration tests against an isolated Supabase test project or local database.
- [ ] Add browser E2E coverage for homepage, catalogue, product, cart, checkout, cake builder, and order tracking.
- [ ] Add browser E2E coverage for admin login, products, inventory, coupons, and order processing.
- [ ] Add Stripe webhook, duplicate event, delayed event, and failed-payment tests.
- [ ] Add coupon expiry, price change, and out-of-stock race-condition tests.
- [ ] Add accessibility checks for critical customer and admin journeys.
- [x] Add an incremental lint/format policy and CI check for every changed file.
- [x] Resolve the pre-existing full-repository Biome lint backlog (82 errors and 141 warnings).
- [ ] Normalize untouched legacy formatting incrementally when those files enter an implementation checkpoint.

## TODO — production readiness

- [ ] Create and validate separate development, staging, and production Supabase/Stripe/SMTP environments.
- [ ] Replace fallback catalogue content with approved production content and imagery.
- [ ] Add analytics, error monitoring, and structured logs.
- [ ] Review rate limiting for a multi-instance production deployment.
- [ ] Add durable abuse protection for public contact, newsletter, cake-request, and order endpoints.
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
