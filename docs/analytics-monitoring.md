# Analytics and monitoring

The admin dashboard and `/admin/analytics` use first-party transactional data as the source of truth. Revenue is calculated from successful payment amounts less recorded refunds. Product reporting uses immutable order-line snapshots, so renaming a product does not rewrite historical sales.

## Definitions

- **Net revenue:** successful payment value minus recorded refunds. It includes tax and delivery charges and is not profit.
- **Average order value:** net revenue divided by paid orders.
- **Returning-customer rate:** the share of buyers in a period with an earlier paid order or multiple paid orders in that period.
- **Cake conversion:** custom-cake requests linked to an order divided by cake requests.
- **Retail stock value:** current sell price multiplied by current stock. It is not cost-of-goods or accounting inventory value.
- **Notification success:** completed transactional email deliveries marked sent divided by deliveries marked sent or failed.

Rolling 7-, 30-, and 90-day views compare with the immediately preceding period of equal length. “All time” has no comparison period.

## Privacy

Migration `0028_privacy_analytics.sql` adds allow-listed storefront events. The browser stores a random UUID in local storage. Events do not contain names, emails, addresses, payment data, cake notes, uploaded images, or search text. Tracking is disabled when Global Privacy Control is enabled.

The public event endpoint validates event names, paths, timestamps, product identifiers, and a small metadata allow-list. The database grants event access only to the service role.

## Monitoring

`src/instrumentation.ts` records uncaught server request failures as structured JSON. Critical admin authentication, order creation, analytics ingestion, and Stripe webhook failures use stable event names so Vercel logs can be filtered and alerted on without relying on free-form messages.

Operational logging omits raw provider error messages, which can contain document links, payment credentials or customer data. Only approved context fields and bounded error identifiers are emitted. `SENTRY_DSN` is reserved and unused; configure deployment log retention and alerts explicitly. Responsive browser tests suppress synthetic analytics ingestion; separate functional API tests verify the endpoint.

Migration `0028_privacy_analytics.sql` was applied to the currently configured Supabase database on 2026-10-02. A live request through `/api/analytics/events` returned 204, stored only the allow-listed anonymous payload, and the verification row was removed afterward.

Before enabling reporting in any additional environment:

1. Apply migration `0028_privacy_analytics.sql` to that environment.
2. Confirm event ingestion on an isolated staging deployment.
3. Verify structured error entries appear in the deployment log service.
4. Add retention and alert thresholds appropriate to the business before traffic grows materially.
