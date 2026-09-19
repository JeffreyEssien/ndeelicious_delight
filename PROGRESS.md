# Project Progress and TODOs

Last updated: 2026-09-19  
Active development branch: `develop`  
Baseline commit: `fc769b6` (`the initial push`)

This is the living checkpoint for implementation progress. Update it when a feature, migration, test, deployment prerequisite, or known limitation changes. `implementation.md` remains the full product plan and definition of done.

## Current checkpoint

The initial full-stack application is committed on `main`. The latest work, currently in the working tree on `develop`, adds:

- Resend-based transactional email helpers.
- Customer emails for orders, cake requests, and newsletter sign-ups.
- Admin emails for new orders, cake requests, and contact messages when `ADMIN_EMAIL` is configured.
- Environment-aware canonical URLs for metadata, `robots.txt`, and `sitemap.xml`.
- A GitHub Actions pipeline split into regression, functional, and structural gates, with opt-in Vercel staging and production deployment.

The email/site-URL changes were already uncommitted when this checkpoint was created. They have been preserved as work in progress and still need dedicated tests and review.

## Implemented

- [x] Next.js App Router storefront and shared layout.
- [x] Product catalogue, category pages, product details, cart, and local cart state.
- [x] Custom cake builder and server-side quote calculation.
- [x] Checkout quote calculation, delivery zones, coupons, and order creation route.
- [x] Order tracking interface and route.
- [x] Supabase schema migrations, server/client access, seed script, and admin bootstrap script.
- [x] Admin OTP authentication, protected admin shell, product/order/content/settings interfaces, and admin mutation routes.
- [x] Contact and newsletter persistence routes.
- [x] Error, loading, not-found, policy, delivery, FAQ, and about pages.
- [x] Unit tests for checkout pricing, cake pricing, inventory rules, formatting, validation, and auth helpers.
- [x] Functional route tests for cake and checkout quotes.
- [x] Metadata, sitemap, and robots route foundations.
- [x] Transactional email integration implemented in the working tree.
- [x] CI gates for regression, functional, and structural tests.
- [x] Opt-in CD jobs for Vercel staging from `develop` and production from `main`.

## Verification status

Verified locally on 2026-09-19 before introducing the CI files:

- `npm run typecheck` — passed.
- `npm test` — 9 files and 27 tests passed.
- `npm run build` — passed; 43 routes/pages generated.

CI command ownership:

- Regression: `npm run test:regression` (domain, validation, and library tests).
- Functional: `npm run test:functional` (route-handler behavior).
- Structural: `npm run test:structural` (Next.js route type generation, strict TypeScript, and production build).
- Full local gate: `npm run check`.

## TODO — immediate

- [ ] Review and format the transactional-email route changes.
- [ ] Add unit tests for HTML escaping, provider failure, and missing email configuration.
- [ ] Add functional tests for order creation, contact submission, and newsletter subscription.
- [ ] Confirm the Resend sending domain and replace the development sender address.
- [ ] Configure `ADMIN_EMAIL`, `RESEND_API_KEY`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME` in staging and production.
- [ ] Configure GitHub/Vercel deployment values, then set repository variable `VERCEL_CD_ENABLED=true`.
- [ ] Add branch protection for `main` and `develop`, requiring all three CI jobs.
- [ ] Commit and push the preserved email/SEO work plus the pipeline after review.

## TODO — commerce-critical

- [ ] Implement Stripe Checkout/payment intent creation.
- [ ] Implement and verify signed Stripe webhooks.
- [ ] Make payment/order processing idempotent.
- [ ] Deduct and restore inventory transactionally after payment/refund events.
- [ ] Prevent overselling under concurrent checkouts.
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
- [ ] Add a lint/format policy and CI check (the repository currently has no lint script).

## TODO — production readiness

- [ ] Create and validate separate development, staging, and production Supabase/Stripe/Resend environments.
- [ ] Replace fallback catalogue content with approved production content and imagery.
- [ ] Add analytics, error monitoring, and structured logs.
- [ ] Review rate limiting for a multi-instance production deployment.
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
