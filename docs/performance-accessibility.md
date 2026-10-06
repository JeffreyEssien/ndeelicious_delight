# Performance and accessibility

## Implemented controls

- Public product, delivery, review, theme, content, and business-setting reads use a five-minute server cache tagged `storefront`.
- Successful owner mutations expire the storefront tag immediately, so catalogue and setting edits do not wait for the time limit.
- The homepage LCP image uses high fetch priority, quality 60, and an exact 1440px responsive candidate.
- Storefront, checkout, and authenticated admin shells provide keyboard skip links.
- The analytics revenue chart has a screen-reader text equivalent.
- Playwright checks overflow, focus trapping/restoration, reduced motion, responsive stress cases, four theme variants, and serious/critical axe violations.
- Authenticated admin axe checks cover the dashboard and analytics workspace when an isolated admin storage state is supplied.

## 2026-10-02 lab result

Measured against the production build with Chromium, 40ms latency, approximately 1.6Mbps download, and 4× CPU throttling after the storefront cache was populated:

| Viewport | LCP | Interaction latency | CLS |
| --- | ---: | ---: | ---: |
| 390 × 844 | 0.77s | 152ms | 0 |
| 1440 × 900 | 2.07s | Not exercised | 0 |

These are controlled lab measurements, not field Core Web Vitals. Confirm p75 LCP, INP, and CLS in the deployed staging and production environments because cold starts, user geography, image-cache state, and real devices can change the result.

## Verification commands

- `npm run check`
- `PLAYWRIGHT_BASE_URL=<isolated-url> npm run test:e2e`

The authenticated and tokenized browser cases require their documented isolated-environment values. They must not use destructive production fixtures.
