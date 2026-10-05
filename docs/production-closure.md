# Production closure — 2026-10-05

Status: **NOT READY**. Local gates do not establish a full paid customer journey or production deployment readiness.

## Repository audit

- Remote main: `b1d106a852b65e4080181484678822fe62f74f47`; remote develop: `51d3999d04998fece9cdee6f75783824bac2c32a`.
- Before synchronization, remote main/local develop had four/one exclusive commits. Merged remote main into local develop, preserving history and existing uncommitted work, at `8a5301a55f6ef5079203bd74bf08d7ff921b1683`.
- Working branch: `production/closure-2026-10-05`. No open PRs at audit time.
- Latest verified application commit: `2284760072fa77e0722d80095a7282877862970b`. Synchronization and closure commits are local; remote branches were not published or deployed.
- Latest application pipeline `36991233315` failed quality and structural jobs; regression and functional jobs passed. Latest scheduled notification run `37287633590` failed because `PRODUCTION_SITE_URL` and `CRON_SECRET` were empty. New remote CI must pass before promotion.

## Database and restoration

The owner explicitly designated configured Supabase as the test database and requested restoration. This is shared development/test infrastructure, not independently isolated staging.

Migration 0027 was absent. Rollback tests reproduced a forged `CUSTOM_CAKE` inventory bypass. The corrected migration requires a matching linked cake/accepted quote and disallows variant references on null-product lines. It validates cake status on linking and insert and prevents detaching an authoritative order.

After 24 rollback checks passed, 0027 was applied in a transaction. Counts and content hashes of every pre-existing public table matched before commit. Business records were unchanged. The expanded suite later passed 27 rollback checks covering document immutability/presentation, invalid/revoked tokens, duplicate quote acceptance/conversion, stock, mixed lines, linked lifecycle/refund/cancellation, delivery permissions, amount tampering, duplicate payment events, and checkout expiry/retry.

A true two-connection inventory race produced one success/one `INSUFFICIENT_STOCK`, zero oversales, unchanged stock, and cleanup of both disposable orders/items/reservations. Original order count was restored to zero. Temporary admin sessions and local storage files were deleted after both browser runs. No email was sent and no Stripe charge was created.

```sh
DATABASE_TEST_AUTHORIZED=true node --env-file=.env.local scripts/test-workflow-integrity.mjs
DATABASE_TEST_AUTHORIZED=true DATABASE_TEST_COMMITTED_FIXTURES=true node --env-file=.env.local scripts/test-inventory-race.mjs
```

The rollback suite reapplies 0027 inside its transaction and always rolls back; it does not deploy migrations. Prefer the trusted database CA through `DATABASE_TEST_CA_FILE`. `DATABASE_TEST_ALLOW_SELF_SIGNED=true` is a test-client-only certificate exception when required. Use direct SQL, not transaction pooling, for these checks. The inventory race temporarily commits disposable pending orders, so only run it on an explicitly authorized test database.

## Verification

- `npm ci` passed; `pg` is a development-only dependency for database checks.
- `npm run check`: quality, CSS tokens (58 referenced, none undefined), 108/108 regression tests, 58/58 functional tests, strict TypeScript and production build passed.
- The staged-file audit found five formatting discrepancies and two accessibility lint defects previously skipped while untracked. Formatting and semantic fieldset/section corrections passed the staged check, canonical gate and final authenticated 28-check rerun.
- Public Playwright: 167 passed, 134 skipped across 320/375/390/430/768/1024/1440px. Berry, Purple, Sunrise and custom storefront themes ran. Conditional catalogue, privileged and token fixtures account for skips.
- Authenticated admin: initial 27 passed/1 failed; after correcting cake-workspace overflow, 28/28 passed at 320/1440px, including dashboard/analytics axe. Sessions were provisioned directly; this is not a complete OTP journey.
- No physical-device Safari/Chrome verification. 360/1280px, all-theme admin coverage and full commerce journeys remain open.
- A separate production build with no `.env.local` also passed; compilation does not require live service credentials.
- Responsive tests now suppress only analytics ingestion to avoid synthetic business metrics; ingestion has separate functional coverage.
- Removed 63 synthetic events from the earlier browser runs; the 22 pre-session analytics records retained the same content hash. Their test limiter row was removed.
- Final telemetry-suppressed smoke: seven passed/two skipped. Final SQL audit: zero orders, original ten admin sessions, zero legacy sessions and no test limiter rows.
- Logs omit raw provider error messages and allow only approved context keys; privacy tests cover secrets, email, document URLs and metadata spoofing.
- SMTP reports success only with accepted recipients; rejected-recipient handling has regression coverage.

## Integrations

| System | Evidence | Status |
| --- | --- | --- |
| Supabase | SQL, corrected 0027, rollback suite and stock race | VERIFIED on configured test database |
| Stripe | Test key and read-only API authentication; database webhook checks | CONFIGURED BUT NOT LIVE-VERIFIED full payment/callback journey |
| SMTP | Connection/authentication succeeded; no message sent | CONFIGURED BUT NOT LIVE-VERIFIED delivery/lease recovery |
| Monitoring | Structured JSON instrumentation and privacy tests | CONFIGURED BUT NOT LIVE-VERIFIED deployment alerting |
| Vercel | Deployed staging/domain checks not performed | BLOCKED release verification |

`SENTRY_DSN` is unused; setting it does not activate Sentry. Structured logging is the existing monitoring equivalent, but deployment alert routing/retention still need verification.

## Environment checklist from .env.example

| Category | Variables | Verification needed |
| --- | --- | --- |
| REQUIRED | `NEXT_PUBLIC_SITE_URL` | Owner-approved canonical HTTPS origin in production; local HTTP is allowed for tests |
| REQUIRED | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Correct environment project; service role server-only |
| REQUIRED | `ADMIN_EMAIL`, `ADMIN_AUTH_SECRET` | Bootstrapped active owner and unique random 32+ character secret |
| REQUIRED | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Consistent test/live mode, correct subscribed endpoint |
| REQUIRED | `SMTP_USER`, `SMTP_FROM_EMAIL` | Approved sender and working authentication |
| REQUIRED alternative | `SMTP_PASSWORD` OR all `SMTP_OAUTH_CLIENT_ID`, `SMTP_OAUTH_CLIENT_SECRET`, `SMTP_OAUTH_REFRESH_TOKEN` | Server-only; supply complete OAuth credentials |
| REQUIRED operationally | `CRON_SECRET` | Unique 32+ characters; matching GitHub production secret and `PRODUCTION_SITE_URL` |
| OPTIONAL | `ADMIN_NAME`, `SMTP_FROM_NAME`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Defaults exist; verify branding/provider and STARTTLS |
| OPTIONAL | `REVIEW_TOKEN_SECRET`, `DOCUMENT_TOKEN_SECRET` | Review key defaults to admin secret; current opaque document hashes do not consume document secret |
| OPTIONAL | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Existing server-created Checkout redirects do not initialize Stripe client-side |
| OPTIONAL / unused | `SENTRY_DSN` | No SDK integration; do not claim activation |
| DEVELOPMENT/operations-only | `DATABASE_URL`, `DIRECT_URL` | Direct migration/integration access; never expose publicly |
| TEST-ONLY | `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_ISOLATED_ENVIRONMENT`, `PLAYWRIGHT_ADMIN_STORAGE_STATE`, `PLAYWRIGHT_QUOTE_RESPONSE_PATH`, `PLAYWRIGHT_DOCUMENT_PATH` | Explicit environment acknowledgement and disposable test fixtures |
| TEST-ONLY | `DATABASE_TEST_AUTHORIZED`, `DATABASE_TEST_COMMITTED_FIXTURES`, `DATABASE_TEST_CA_FILE`, `DATABASE_TEST_ALLOW_SELF_SIGNED`, `DATABASE_TEST_SSL` | Explicit authorization, cleanup and SQL TLS settings |

Production Vercel values were not audited. Storage buckets/policies are migration-owned; no invented storage environment variable is needed. Final catalogue, tax, delivery, contacts and policies require owner approval before launch. Legacy Supabase Auth sessions counted zero during the read-only audit; no authentication users/sessions were revoked.

## Remaining risks and next action

- **P1:** Full normal/cake paid browser journeys, signed provider callbacks, invoice/receipt issuance and SMTP sink delivery remain unverified.
- **P1:** True quote conversion/revision races, expired/regenerated/context-scoped document links, refund races and interrupted quote-delivery recovery need fixtures/assertions. Sequential duplicates are not concurrency coverage. Document issuance spans REST writes with some unchecked event/supersession results; atomic failure behavior remains open.
- **P1:** Shared test environment, remote CI, scheduled notification secrets, live webhook subscriptions, canonical domain/SSL and production configuration remain release prerequisites.
- **P2:** Physical browsers, remaining widths/admin themes, deployment alerts and field performance need checks.

Highest-value next action: build a repeatable paid checkout/custom-quote browser harness with disposable database fixtures and a safe SMTP sink; verify signed Stripe callbacks, documents and cleanup before promotion.

## Recovery prerequisites

Retain an owner-controlled database backup/export and the previous deployed SHA before promotion. Revert application deployments to that SHA; retain additive migrations unless a separately reviewed forward repair is required. Never purge financial records as rollback. Disable payment entry during integrity incidents, reconcile Stripe events with payment attempts/orders, and retry durable notifications after checking delivery state. Actual free-tier Supabase backup availability was not verified.
