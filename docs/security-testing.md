# Security and test-depth checkpoint

Last verified: 2026-10-03

G15 is active. This document records the protections already implemented and the work that remains before the checkpoint can be closed.

## Public endpoint abuse protection

Migration `0029_public_rate_limits.sql` adds an atomic, database-backed limiter that works across multiple application instances. Only the service role can execute the limiter function or access its table. Row-level security is enabled, and no raw IP address is stored: the application derives an HMAC fingerprint from the requester address and user agent with the server-only admin authentication secret.

| Scope | Limit | Window |
| --- | ---: | ---: |
| Contact, newsletter, cake request | 5 | 1 hour |
| Order creation, review submission, quote response, quote checkout | 10 | 1 hour |
| Order tracking | 30 | 15 minutes |
| Payment retry | 10 | 15 minutes |
| Payment status | 180 | 15 minutes |
| Checkout quote | 60 | 1 minute |
| Customer document PDF | 30 | 1 minute |
| Anonymous analytics event | 120 | 1 minute |

Blocked requests return `429` with a `Retry-After` header. A database/RPC failure returns `503` and a structured server log rather than silently disabling protection.

The migration was rollback-verified and applied to the currently configured Supabase database. The live application check sent 121 invalid analytics requests under one isolated fingerprint: the first 120 reached validation and the 121st returned `429`. The exact test limiter row was deleted afterwards.

## Browser response hardening

All routes receive a baseline Content Security Policy, Permissions Policy, strict-origin referrer policy, two-year HSTS policy, MIME-sniffing protection, and frame denial. These headers were confirmed against a local production server. The CSP intentionally begins with low-risk navigation/embedding directives; script and style source restrictions should be expanded only after testing Stripe and all deployed third-party resources in staging.

## Dependency status

Next.js was upgraded from 16.3.5 to 16.3.8 to address the critical `ImageResponse` advisory reported by npm. `npm audit --omit=dev` reports zero known vulnerabilities after the upgrade.

## Remaining G15 work

- Run database integration tests against an isolated local or test Supabase environment, including document immutability, expired/revoked access, revision races, and concurrent quote conversion.
- Add full browser journeys for storefront checkout, cake builder, order tracking, admin login, catalogue/inventory management, coupon handling, and order processing.
- Exercise rate-limit and same-origin behavior from the browser, including retry messaging and shared-instance concurrency.
- Complete the remaining delayed/duplicate payment, reservation, refund, quote-conversion, and multi-request race cases in an isolated environment.
- Repeat migration and security-header verification in staging before production promotion.
