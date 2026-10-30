# Stripe integration: remaining steps

Payments now use Stripe's **embedded payment form** (Checkout Studio, `ui_mode: "form"`). Customers pay on the shop's own `/pay` page instead of being sent to a Stripe-hosted page. This file is the single source of truth for what's left to do.

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- None. The Checkout Session call in [src/lib/payments/stripe.ts](src/lib/payments/stripe.ts) already uses real values.

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| mode | `payment` | Nothing to change. Orders are one-time payments, so `payment` is correct. |
| line_items | One line with `price_data` for the order's real total and currency (`Ndeeelicious Delight order ND-…`) | Nothing to change. Totals come from the shop's own pricing, delivery and tax at checkout, so no Stripe Price IDs are needed. |

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly.

**Files containing these parameters:**
- [src/lib/payments/stripe.ts](src/lib/payments/stripe.ts) (Checkout Session parameters)
- [src/components/checkout/payment-entry.tsx](src/components/checkout/payment-entry.tsx) (the form's `appearance`)

| Parameter | Value |
|-----------|-------|
| ui_mode | `form` |
| billing_address_collection | `auto` |
| phone_number_collection | `{ enabled: false }` |
| automatic_tax | `{ enabled: false }` |
| submit_type | `auto` |
| integration_identifier | `custom_embedded_web_0001` |
| payment_method_collection | Not sent. Stripe only allows it for `mode: "subscription"`, and these are one-time payments. |
| appearance | `theme: stripe`, `labels: auto`, `inputs: spaced`, `borderRadius 4px`, `colorPrimary #0570de`, `colorBackground #ffffff`, `colorText #30313d`, `colorDanger #df1b41`, `colorSuccess #00c853`, `fontSizeBase 16px`, `spacingUnit 4px` |

### Parameters kept on purpose

The Studio settings don't list these, but the shop needs them to work, so they stay in the call:

| Parameter | Why it stays |
|-----------|--------------|
| `metadata` (`order_id`, `order_number`) and `payment_intent_data.metadata` | The webhook and the "confirm directly with Stripe" check use them to find the order a payment belongs to. Without them, paid orders would stay unpaid. |
| `client_reference_id` | The order id, so you can find the order from the Stripe Dashboard. |
| `customer_email` | Pre-fills the customer's email so receipts go to the right person. |
| `expires_at` (31 minutes) | Matches how long stock is held for a checkout. Expired sessions release the stock and can be renewed from `/pay`. |
| `return_url` | Required for the embedded form. Replaces the old `success_url` and `cancel_url`, which Stripe doesn't allow with `ui_mode: "form"`. It sends customers to the order success page after paying. |

## Setup: where to go from here, now that you have Stripe access

Do everything in **test mode or a sandbox first**. Use live keys only on the live site, once testing has passed.

### 1. Get the API keys
In the Stripe Dashboard (in a browser, since the mobile app has no developer settings), open **Developers → API keys** with test mode or a sandbox selected:

| Environment variable | Value | Where it's used |
|----------------------|-------|-----------------|
| `STRIPE_SECRET_KEY` | `sk_test_…` (server only, never in the browser) | Creating and checking Checkout Sessions, refunds |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` | Loading the embedded form on `/pay` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (step 2) | Verifying webhook calls |
| `NEXT_PUBLIC_SITE_URL` | The site's address, e.g. your preview URL | `return_url` and payment links |

The names match [.env.example](.env.example). This is a Next.js app, so browser-visible variables use the `NEXT_PUBLIC_` prefix (not `VITE_`) and the secret key has no prefix. Set them in Vercel under **Project → Settings → Environment Variables** (Preview for testing, Production for live), then redeploy.

### 2. Create the webhook
Open **Workbench → Webhooks** (also linked from Developers) and choose **Create an event destination**. Select these events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `refund.created`
- `refund.updated`
- `refund.failed`

Then choose **Webhook endpoint**, set the URL to `https://<your-site>/api/stripe/webhook`, and create it. Click **Reveal** on the signing secret and put it in `STRIPE_WEBHOOK_SECRET`.

Test and live mode each need their own webhook and their own `whsec_` secret.

### 3. Dependencies
Nothing to install. The installed `stripe` package (22.6.2) uses API version `2026-08-26.dahlia`, which supports `ui_mode: "form"`. Stripe.js loads from `https://js.stripe.com/dahlia/stripe.js` on the `/pay` page, never bundled or self-hosted.

## What changed

No new routes or pages. Existing files were updated:

```
src/lib/payments/stripe.ts                  Checkout Session parameters; returns the client secret and the /pay link
src/app/api/payments/retry/route.ts         also returns sessionId and clientSecret for the /pay page
src/components/checkout/payment-entry.tsx   mounts Stripe's embedded form (was: redirect to Stripe)
src/app/documents.css                       spacing for the form container
src/lib/payments/stripe.test.ts             new tests for the session parameters
STRIPE_INTEGRATION_TODO.md                  this file
```

## How it works

1. The customer checks out. `POST /api/orders` creates the order, holds the stock and creates an embedded-form Checkout Session.
2. The browser goes to `/pay?session=cs_…`. That page asks `/api/payments/retry` for a payable session, which renews an expired one or refuses one that's already paid. It then loads Stripe.js and mounts the form with the client secret.
3. The customer pays in Stripe's secure iframe. Stripe sends them to `/order-success?session_id=…`.
4. The order becomes **paid** when the webhook arrives. If the webhook is late, the success page confirms with Stripe directly, so the order never gets stuck. Emails, push notifications and the admin alert go out once.
5. Unpaid checkouts expire after 31 minutes, which releases the stock. The customer can come back to `/pay` (from the success page or the invoice) to pay with a fresh session.

Quote payments and invoice "Pay now" links use the same `/pay` page.

## Testing

Use test mode with any future expiry date, any 3-digit CVC and any postal code:

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0025 0000 3155` | Asks for 3-D Secure, then succeeds |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 0002` | Declined (generic) |

Check afterwards:
- The order shows as paid in admin.
- Stock went down.
- The customer email arrived.
- The payment appears under **Payments** in the Stripe Dashboard.
- A refund from the admin order panel shows up in Stripe.

For local testing without a public URL, forward webhooks with the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Next steps

- **Products:** nothing to set up in Stripe. Prices, delivery and tax come from the shop admin.
- **Fulfilment:** already handled. Paid orders appear under Orders with a one-tap next step.
- **Order tracking:** customers can follow their order at `/track-order` and switch on push updates.
- **Going live:** once testing passes, switch the Vercel Production variables to the live keys and a live webhook secret, then release `dev` to `main`.
- **Appearance:** the form currently uses the Studio colours (blue `#0570de`). To match the shop's theme, change `appearance.variables.colorPrimary` in [payment-entry.tsx](src/components/checkout/payment-entry.tsx), or update it in Checkout Studio.

## Resources

- Stripe support: https://support.stripe.com
- Stripe MCP (connect Stripe to AI tools): https://docs.stripe.com/mcp
