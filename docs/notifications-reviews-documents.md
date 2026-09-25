# Notifications, verified reviews, and business documents

## Production configuration

Set these in Vercel for the Production environment:

- `NEXT_PUBLIC_SITE_URL`: the canonical HTTPS domain, without a trailing slash.
- `CRON_SECRET`: the same random value used by the GitHub production environment.
- `ADMIN_AUTH_SECRET`: the existing 32+ character admin/session secret.
- `REVIEW_TOKEN_SECRET` and `DOCUMENT_TOKEN_SECRET`: optional separate 32+ character secrets. When omitted, domain-separated signatures use `ADMIN_AUTH_SECRET`.
- Existing Google SMTP variables must remain configured.

Set these in the GitHub `production` environment:

- Secret `CRON_SECRET`: exactly the same value as Vercel.
- Secret `PRODUCTION_SITE_URL`: the canonical Vercel/custom-domain URL.

The `Scheduled customer and inventory emails` workflow runs hourly. It calls `/api/cron/notifications` with a bearer token. The endpoint is idempotent:

- one low-stock digest per active admin and local business date, sent on the first run at or after 8:00 a.m. in the configured business timezone;
- one consolidated review-invitation email per delivered order, eligible 12 hours after `DELIVERED` and retried if SMTP fails.

## Admin recipients

Operational messages are sent individually to every active record in `admins`. Adding an admin with `npm run admin:bootstrap` automatically adds that email to future order, paid-order, cake-request, contact, and stock notifications. Inactive admins are excluded.

## Verified-purchase reviews

Public review submission is closed. Each order item receives a signed, single-use invitation after the order is marked delivered. Invitations expire after 90 days. The database function verifies order state, invitation eligibility, expiry, and one-time use atomically. Only approved reviews with `verified_purchase = true` appear publicly.

## Documents

- Admin order drawers link to printable invoices and paid receipts.
- A saved custom-cake quote links to its printable quote.
- Paid customer emails include a signed receipt link.
- Saving a cake quote emails the customer a signed quote link.
- Customer links are HMAC signed and cannot be changed from one order/document type to another.
- Use the document page’s **Print or save PDF** button to print or download a PDF through the browser.

Complete the business address, tax label, and GST/HST registration number under Admin → Settings before issuing production documents.
