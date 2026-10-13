# Dynamic made-to-order packs

Implemented on `develop`, 11 October 2026. Migration **0041 is prepared and locally tested, not applied to the live database**. Apply it before deploying the application changes.

The [reference catalogue](https://cakesandcream.ng/product-category/birthdays/) and [cupcake configuration](https://cakesandcream.ng/product/cupcake/) informed the Select options → choose configuration → add to basket interaction. The implementation uses the existing app components and theme tokens.

## Owner workflow

In Products → Add/Edit → Made to Order, use **Add pack** for any positive whole-number size. Summary cards show the editable name, pieces, final CAD selling price and availability. **Edit** opens one card; inventory and the generated SKU sit inside a disclosure. Owners can duplicate, reorder, disable/re-enable or retire packs. Retirement is committed only on save, preserves the variant record and keeps it out of subsequent editing and customer checkout. Disabling remains reversible.

There is one optional **Add common sizes** button. It adds only missing 3/6/12 sizes, unavailable and unpriced until configured. Those sizes are examples, not restrictions. Empty made-to-order drafts can be saved; publication requires valid, uniquely sized, priced active packs. Legacy options with no pieces-per-pack remain intact and editable, but need completion or disabling before publication.

Owners enter final pack prices. The editor converts these to the existing adjustment field using the effective base/sale price. Changing either base or sale price preserves every pack's final price. There is no second persisted pricing model. Existing automatic, immutable inventory-unit SKUs remain managed by the database.

## Customer and inventory behaviour

Made-to-order cards always use **Select options**, including products with one pack. Starting prices use real eligible pack prices; sold-out cards retain real prices rather than showing an unrelated base price. Different prices receive a “From” prefix.

The product page shows published pack names, sizes and prices. Small lists use labelled radio cards; larger lists use a native selector. There is no arbitrary default choice for made-to-order packs. Price, ordered pack count, total pieces and total charge update together. Selecting a lower-stock pack clamps the quantity. A pack of 8 ordered twice is 2 packs / 16 pieces, billed twice at the pack price.

Basket drawer, basket page, checkout preview, server quotes, coupons and taxes use canonical variant pricing. Order snapshots retain the selected name, price, pack size, pack count, total pieces and tracking policy. Admin order details, financial documents and exported PDFs show pack counts and pieces from historical snapshots.

Per-pack stock tracking overrides the product default; a null override inherits the legacy policy. Stock represents packs. Untracked published packs remain available at zero stock. Customer/server availability subtracts active reservations; admin stock remains physical stock for safe edits. The existing catalogue cache can lag changes, while checkout reloads current availability and the database reservation operation remains authoritative. Retired reserved packs can still complete and refund. Paid legacy orders with missing pack sizes remain readable and fulfilable.

## Files and migration

- Admin: `src/components/admin/product-editor.tsx`, inventory workspace and order detail display; existing product create/edit/duplicate API routes; product validation and atomic save argument/error helpers.
- Catalogue: product types/data mapper; shared availability/pricing helpers; product cards, purchase controls and catalogue sorting; theme-based pack styles in `src/app/globals.css`.
- Commerce/documents: providers, both basket views, checkout preview/pricing and order snapshots; historical admin mapping; HTML document, text and PDF rendering.
- Verification: existing unit/API suites, `scripts/test-product-packs.mjs`, `e2e/product-packs.spec.ts`; updated configuration selectors and isolated commerce fixtures. CI runs the pack database and browser checks.

[`0041_dynamic_product_packs.sql`](../db/migrations/0041_dynamic_product_packs.sql) adds deterministic variant `sort_order`, nullable tracking overrides and retirement metadata. It provides atomic product saves/duplication and transactional audit records, protects variant/image ownership and stale stock, and updates existing reservation/commit/refund operations and inventory/dashboard summaries for per-pack policies. Deferred publication checks validate the final transaction state without obstructing stock-only maintenance of legacy paid orders. No pack sizes or prices are seeded.

## Verification

- **270 unit/API tests pass in 68 files.** Includes arbitrary pack validation, disabled/retired availability, sold-out prices, canonical discount/coupon/tax totals, server-priced 16-piece order snapshots and PDF extraction of saved pack counts/totals.
- **63 browser tests pass** at 320, 375, 390, 430, 768, 1024 and 1440 pixels: 21 pack tests and 42 existing configuration, mobile/payment-link, invoice/PDF, delivery/checkout and marketing regression checks. Each primary pack test checks owner and customer screens across Berry, Purple and Sunrise, keyboard selection, touch targets, overflow and scoped WCAG accessibility. New tests also cover empty drafts, publication errors, duplication, loading/conflict feedback, repeat presets, reload persistence and larger selectors.
- Local PostgreSQL/PGlite pack checks pass: atomic rollback, ownership, unique active sizes, stable save IDs, independent prices, stale/reserved stock, tracked/untracked holds, reservation-aware availability, retirement/commit/refund, legacy paid orders, retained snapshots, normal ready-to-order/ready-to-bake inventory, image duplication and service-only permissions.
- Existing local cake/commerce migrations and admin database suites pass.
- Type check, production build, Biome and CSS token audit pass. The initial ordinary build completed with sandbox DNS warnings while reading Supabase. The final production build uses isolated local data; it is a verification artifact, not a deployable production configuration. Biome reports three existing informational template-literal suggestions outside this task, with no errors.

Real failures were corrected during development: outdated route-test mocks after atomic saves; TypeScript narrowing for empty drafts; missing legacy-refund exemptions; browser assumptions about automatic basket opening and hidden streamed content; the old expanded variant-editor selector; and preparation-time leakage between fixtures. No snapshot baselines were blindly updated.

Six representative 390px screenshots are retained below. The full 42-screen owner/customer matrix was produced by the passing Playwright run and remains in `test-results/playwright` / CI artifacts.

| Theme | Owner | Customer |
|---|---|---|
| Berry | [Pack editor](dynamic-packs-evidence/390/berry-owner-packs.png) | [Selected pack](dynamic-packs-evidence/390/berry-selected-pack.png) |
| Purple | [Pack editor](dynamic-packs-evidence/390/purple-owner-packs.png) | [Selected pack](dynamic-packs-evidence/390/purple-selected-pack.png) |
| Sunrise | [Pack editor](dynamic-packs-evidence/390/sunrise-owner-packs.png) | [Selected pack](dynamic-packs-evidence/390/sunrise-selected-pack.png) |

## Deployment

### Mobile overlay follow-up

The skip link now appears only for keyboard focus, the Next.js development indicator is disabled, and the product editor uses the dynamic viewport height with its own scrollable content. Pack edit buttons retain their width and footer actions wrap on narrow screens. Editor evidence now captures the viewport instead of combining a fixed drawer with a full-page background. Seven focused browser checks pass at all configured widths, covering keyboard skip access, dialog focus, scrolling to Save/Cancel and viewport bounds. TypeScript, Biome and the CSS token audit also pass.

1. Migration 0041 was authorized and applied on October 11, 2026 using `node scripts/rollout-product-packs.mjs --apply`. Transactional verification confirmed service-only RPC permissions and unchanged counts: 12 products, 35 variants and 2 orders. Previous function definitions and the migration checksum/receipt are saved under `.commerce-backups/product-packs-2026-10-11T12-20-57.884Z/`.
2. Rebuild and deploy with the actual production environment. Do not deploy the fixture build.
3. Complete a live payment-provider smoke test and review legacy made-to-order options that have no pack quantity. The owner can configure or disable those without deleting history.

Migration 0041 is now applied to the configured Supabase database. No deployment, Git commit or push was performed. Live Stripe/mail-provider behaviour and production-scale performance are not claimed verified by the isolated tests.
