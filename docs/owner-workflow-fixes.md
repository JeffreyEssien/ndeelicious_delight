# Owner workflow fixes — 5 October 2026

Application commit: `83c467f`.

## Changes

- **Delivery:** Admin → Delivery edits the Canadian area name, CAD fee, minimum order, delivery estimate, active state and ordering. Saving a new area returns its permanent ID, allowing subsequent edits. Active saved areas appear in customer checkout and accepted-quote checkout. With no active areas, customers are offered pickup and an availability explanation. The owner sets rates; no live delivery rates were invented or enabled.
- **Marketing:** The image optimizer request now uses the allowed quality of 75 instead of rejected quality 90. The preview scales to its column. Download anchors are attached to the document, and generated URLs remain valid long enough for download. PNG and multi-product ZIP exports were verified. Marketing defaults and the local canonical URL use `https://www.ndeelicious.com`; captions use the editable marketing URL.
- **Carousel:** The homepage carousel photo opens that product’s detail page. It does not navigate to an image URL.
- **Coupons:** Grouped responsive fields replace the wide twelve-column presentation. New coupons retain their permanent IDs after save, so existing coupons can be edited without duplicate creation. The editor marks new coupons as unsaved and uses CAD rather than naira labels.
- **Quotes:** The actual Send quote button issued a document and delivered its email to a local TLS SMTP sink. The admin now refreshes pending email status automatically and displays sent/failed outcomes. The customer selects an active delivery area. The final amount has a bounded heading, a separate readable amount and a separate payment button.
- **WhatsApp:** Admin → Settings → Business details is the single source for a WhatsApp link or international number. Public contact/footer/chat links use a shared URL helper and a readable label. Order and quote emails include the label and link. Customer documents read the current WhatsApp setting without changing saved financial totals. Downloaded PDFs contain a clickable link annotation.
- **Inventory:** Each option has an action to open the full product editor, including price, names, SKU, options, option activation, inventory tracking, quantities and low-stock alerts.

## Verification

- 113 regression tests and 58 functional/API tests passed.
- TypeScript, production build, quality and the CSS-token audit passed.
- 28 authenticated admin responsive/accessibility checks passed.
- Real browser workflow smoke passed: area creation and repeat editing; coupon creation and repeat editing without duplicates; rendered marketing preview; PNG and ZIP downloads; full inventory editor access; Send quote with automatic SENT display; quote acceptance and delivery selection; fee-inclusive total and Stripe test Checkout creation; PDF download with WhatsApp link; carousel photo-to-product navigation; and the repaired admin pages at 320px and 1440px.
- A $100 CAD disposable cake quote plus $13.50 test delivery produced a $113.50 final payable amount. The temporary Stripe Checkout sessions were expired. No real charge or external customer email was sent.

All tagged cake/quote/order/area/coupon records and test sessions were removed. The carousel setting was restored, anonymous analytics remained at 22 records, and unrelated owner orders/sessions were retained. Only the intended marketing URL setting and local canonical URL remain changed in configuration. A private backup of the previous marketing URL setting is retained outside the repository.

## Deployment and remaining checks

The fixes are committed locally; they have not been deployed to the public website. Production hosting must set `NEXT_PUBLIC_SITE_URL=https://www.ndeelicious.com` and deploy this application commit. Real inbox delivery and a fully paid browser journey remain production-closure checks. Existing catalogue prices/photos/names are owner data and were not replaced with guessed product data; the full product editor controls them.
