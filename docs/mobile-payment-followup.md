# Mobile admin and payment-link follow-up — 2026-10-11

This follow-up uses the supplied screenshots as concrete feedback. The earlier overflow checks did not establish that these pages were simple or comfortably usable; the changes below address hierarchy, density, grouping and interaction as well as width.

| Reported problem | Change | Verification |
| --- | --- | --- |
| Manage-order details are crowded and poorly grouped | Customer/order information comes before documents. Details use separated cards, smaller consistent typography and stacked mobile contact fields. Primary next action remains visible; stage changes, email retries and summary printing are inside More actions. Notes and activity are collapsed. Item configuration uses a compact two-column breakdown. | History detail actions, URL return, financial totals and keyboard checks at seven widths; screenshot gallery below |
| Emailed Pay now opens an expired Stripe session | Confirmed the reported session is **expired and unpaid** with a read-only Stripe API request, while its database row still said pending. Invoice links now go through `/pay`; older saved invoice Stripe URLs are normalized at rendering time without changing financial snapshots. Clicking Continue checks the latest actual Stripe session. Open sessions are reused, completed/paid sessions are rejected, expired attempts are retired and stock/coupon holds reacquired before renewal. Stable renewal keys and duplicate-safe inserts prevent repeated identical attempts from creating extra sessions. | Payment route regression tests cover open, expired, completed, already-paid/cancelled and provider failure. Quote checkout also checks Stripe and can renew a failed expired attempt using its saved amount. Browser entry performs no payment mutation before an explicit click. |
| Invoice print page has too many competing controls | Print and Download PDF are the primary actions. Sharing is collapsed separately; design/notes/options and their save/reset controls stay inside Presentation options. Saved number/customer are a small context row. Mobile invoice items show quantity, unit price and amount on one compact row rather than three full-width rows. HTML/PDF financial calculations and saved designs remain intact. | Nine document/design combinations per viewport, authorized PDF downloads and visible print content |
| Cake request and cake management are overwhelming | Communication history is collapsed; the technical workflow sentence is removed. Converted cake requests show the agreed quote rather than an unusable disabled amount field. Cake types have a collapsible named card; adding a cake opens its editor. Published checkboxes stay alongside their labels. | Draft/photo/option ordering/publication/customer-builder regression and responsive screenshots |
| Product cards take excessive vertical space on phones | Mobile cards use a two-column facts grid, a full-width product header and clear Edit/Duplicate buttons. Technical slugs no longer dominate list cards; their editing capability is preserved. | Explicit compact-card height assertion, no overflow and product-edit persistence checks |
| Inventory groups run together | Group headers wrap, use smaller supporting text, show View stock/Hide stock, and have space between cards. Explicit stock confirmation and conflict protection remain unchanged. | Inventory no-on-blur write and confirmed-stock update checks |
| Delivery settings overflow and days run together | Delivery and pickup day choices wrap into separate touch-friendly labels; responsive field rows stack. The area save bar is static in its own editor instead of floating over schedule fields. Checkboxes align with their labels; form groups have padding and spacing. | Every weekday stays within the viewport and has a 44px touch target at seven widths |
| Shopping & preparation only accepts hours | Product editor has Minutes/Hours with automatic conversion when switching. Existing whole-hour settings keep their familiar hours display. Whole-minute values persist through the existing hours-based API; storefront and checkout display readable minute/hour durations. Pickup preparation buffer can also be entered in minutes. | Whole-minute validation, migration round-trip, unit conversion, save/reload/storefront and exact readiness time including buffer |

## Payment scope and existing emails

Stripe Checkout sessions have a finite lifetime; a stored URL cannot establish that a session is still open. This implementation verifies `status`, `payment_status` and expiry before reuse. See [Stripe Checkout session documentation](https://docs.stripe.com/api/checkout/sessions/object).

Old already-sent emails that contain a direct expired Stripe URL cannot be rewritten. Open the invoice through its document link to use the renewed payment entry, or share the invoice again using the existing admin action. This work did not send customer emails, create real Stripe checkout sessions, charge or refund payments, or change payment state during live diagnosis. Full externally delivered payment completion remains an integration/deployment check; local regression uses controlled fixtures and mocks.

Payment-status polling recognizes elapsed stored expiry so that a pending database row no longer strands the customer at “confirming payment” indefinitely. Stripe remains authoritative for whether a payment may be restarted. A retired expired attempt cannot later release a new reservation through the old expiry webhook branch.

## Minutes migration

`0039_product_preparation_minutes.sql` widens `products.preparation_hours` from integer to double precision, retaining its range guard and adding whole-minute validation. Existing hour values are preserved. The API retains its existing hours contract (`45 minutes = 0.75 hours`) so all existing readiness calculations continue to work.

Applied transactionally to the previously authorized configured Supabase project `lmgwshcddlgjoanwgqnn`. Verified row count and a checksum of all existing preparation values before commit, validated the constraint, and requested PostgREST schema reload. Receipt: `.commerce-backups/admin-minutes-2026-10-11T06-37-28.468Z/rollout.json`. Application deployment remains separate.

## Validation and screenshots

- `npm test`: **63 files, 251 tests passed**.
- `npm run quality`, `npm run typecheck`, `npm run test:css`: passed.
- `npm run build`: passed using isolated placeholder credentials.
- `node scripts/test-preparation-minutes.mjs`: passed. Existing hours preserved; 1/15/45/90 minutes persist; negative, excessive, nonfinite and fractional-minute values rejected.
- Initial all-width workflow run: **21/21 passed**. Focused final 320px minute-persistence/payment-entry smoke: **2/2 passed**.
- The broader run covered seven widths and theme/accessibility checks: **40 passed, 2 preparation-selector assertions failed while changes were in flight**. After freezing the source, the affected controls and history workflows were rerun: **21/21 passed (1.2 minutes)** at all seven widths, including both previously failing viewport cases. All seven theme/accessibility audits and all seven document/configuration cases passed in the broader run. Earlier diagnostic runs caught a disclosure handler bug, an ambiguous test alert selector, and a stale editor refresh race; these were corrected before the final run.

[Final screenshot gallery](mobile-payment-followup-evidence/README.md). All screenshots use synthetic fixtures. Original client screenshots remain the references in this conversation; the previous implementation’s captures are retained in [the earlier gallery](admin-fixes-part-2-evidence/README.md).

The configured Supabase API also passed a read-only check that `preparation_hours` remains a JSON number after migration 0039. No live product preparation values were edited during verification. Final quality, typecheck, CSS audit, production build and `git diff --check` passed. Changes remain uncommitted.

## Modified source files

- `db/migrations/0039_product_preparation_minutes.sql`
- `docs/mobile-payment-followup.md`
- `e2e/admin-configuration.spec.ts`
- `e2e/admin-mobile-followup.spec.ts`
- `scripts/test-admin-cake-publication.mjs`
- `scripts/test-admin-history.mjs`
- `scripts/test-admin-inventory-pagination.mjs`
- `scripts/test-admin-safe-operations.mjs`
- `scripts/test-preparation-minutes.mjs`
- `src/app/(checkout)/pay/page.tsx`
- `src/app/admin.css`
- `src/app/api/documents/quotes/checkout/route.test.ts`
- `src/app/api/documents/quotes/checkout/route.ts`
- `src/app/api/payments/retry/route.test.ts`
- `src/app/api/payments/retry/route.ts`
- `src/app/api/payments/status/route.ts`
- `src/app/documents.css`
- `src/components/admin/admin-portal.tsx`
- `src/components/admin/cake-types-editor.tsx`
- `src/components/admin/fulfilment-settings.tsx`
- `src/components/admin/live-sections.tsx`
- `src/components/admin/product-editor.tsx`
- `src/components/checkout/checkout-flow.tsx`
- `src/components/checkout/payment-entry.tsx`
- `src/components/checkout/payment-result.tsx`
- `src/components/documents/document-composer.tsx`
- `src/features/catalog/preparation.test.ts`
- `src/features/catalog/pricing.ts`
- `src/features/fulfilment/fulfilment.test.ts`
- `src/lib/documents/dto.test.ts`
- `src/lib/documents/dto.ts`
- `src/lib/documents/service.ts`
- `src/lib/payments/stripe.ts`
- `src/validations/product.test.ts`
- `src/validations/product.ts`

The four existing admin SQL verification scripts have formatting-only changes to satisfy the branch-wide Biome check.
