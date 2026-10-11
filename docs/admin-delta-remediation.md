# October 11 recheck: delta remediation

This addresses the supplied audit of develop commit a6e698f. Existing pagination, immutable documents and reservation-aware stock operations are retained. Changes remain local until committed and deployed.

| Finding | Change and verification |
| --- | --- |
| Order state isolation | Loaded details carry their requested identifier; mismatched response IDs are rejected. Browser history clears old details, and record identity remounts the form. Browser regression checks a delayed second response, hidden old controls, separate notes and Back restoration. |
| Cake quote isolation | Request changes reset draft/preview/approval state. Record remounting also isolates outstanding requests. Preview signs request ID, amount, current document revision, request timestamp and a 15-minute expiration. Sending verifies that signature and revision, then conditionally updates only the unchanged, unconverted request. The document writer rechecks the reviewed amount and revision after reading its source, so a concurrent edit cannot silently replace the approved price. Unit tests reject another request, changed revision and a failed conditional update. Browser checks verify the amount and approved preview clear when navigating to another request and back. |
| Payment polling | Sequential timeout polling starts at 5 seconds and increases to 30 seconds. It stops for completed, failed, expired and refunded payments; pauses when hidden; and cleans up on unmount. Browser tests simulate 15 minutes, terminal completion and hidden-tab pausing. Payment pages remount by session ID. |
| Invalid payment entry | Invalid IDs show a recovery explanation and contact link rather than an unexplained disabled button. GET still cannot create a checkout. |
| Duplicate cake queue | One visible “Awaiting approval” category replaces the two identical QUOTE_SENT queues. The existing database alias remains compatible with older clients. |
| Category counts | The UI explicitly labels badges as all-time category totals and filtered rows as matching results. |
| Cake management | Cake editors start collapsed until the owner chooses a cake; shared choice administration has its own collapsed section. Cake tax controls are disclosed with a visible setup status; preparation fields use owner-facing labels. Existing option assignment, sorting, publication checks and photo upload remain available. |
| Customers capped at 100 orders | A service-role database aggregate over all orders replaces recent-order client aggregation. Search, totals and 25/50/100 pagination operate on customer summaries. No customer order records are sent to the browser. A 5,001-customer database test verifies complete reachability, repeated/case-insensitive emails, updated names and unpaid-order exclusions. |
| Inventory bulk/CSV | Full inventory streams in bounded 100-variant database batches with a UUID cursor. CSV import reviews 1–100 unique variants before explicit confirmation. Every row uses the existing reservation-aware, audited compare-and-set RPC. Partial success and rejected rows are reported separately. The imported `expected` quantity remains the export snapshot; conflicts require a fresh export. Formula-leading display fields are escaped. |
| HTML/PDF branding | Both renderers resolve local PNG/JPEG or PNG/JPEG from the configured HTTPS Supabase storage origin, with the same default logo. PDF storage requests disallow redirects, time out at 5 seconds and limit content to 2 MB. Unsupported historical logo formats/hosts use the shared default; stored financial snapshots are unchanged. |
| Conflicting filter layout | Removed the obsolete single-column phone declaration that the later two-column filter rule overrode. |
| Skipped browser CI | Added an unconditional isolated admin browser/accessibility job and an admin database migration/scale job. Deployment jobs require these checks. The separately configured live-staging suite remains conditional. |
| Scheduled notifications | Workflow accepts `PRODUCTION_SITE_URL` from production secrets or variables and clearly identifies missing configuration. `.env.local` now has confirmation comments without altering its values. Local `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET` are present; `PRODUCTION_SITE_URL` must be confirmed in GitHub’s production environment. |

## Migration and live database evidence

Migration `0040_admin_customer_pages.sql` was applied transactionally to the same configured Supabase project, `lmgwshcddlgjoanwgqnn`. It adds one customer-history index and one read-only RPC without changing order/customer rows. Execute permissions were verified for service_role and denied to anon/authenticated. The private receipt is `.commerce-backups/admin-customers-2026-10-11T07-14-06.745Z/rollout.json`.

A post-commit read-only check verified all eight admin RPCs, the double-precision preparation field, its validated whole-minute constraint, and the customer RPC through PostgREST. Orders history took 36.893 ms and cake history 1.414 ms in single current-database EXPLAIN ANALYZE calls. The current database has only one aggregated customer; these timings do not establish large production workload performance.

History retains offset pagination to support numbered-page navigation. The full-history database suite exercises 5,001 orders/requests at all supported sizes. Large production query performance and concurrent workload capacity still require representative staging data; this report does not claim those concerns are eliminated.

## Validation

- Unit/API suite: 262 tests across 68 files passed.
- Database suite: history reachability/search/counts, stock concurrency/reservations/audit rollback, grouped inventory pagination, cake publication/history preservation, dashboard aggregation, preparation-minute round-trip and customer aggregation passed.
- Type-check, formatting/lint, CSS token audit and production build passed locally.
- Seven-width browser suite: 70 broad admin checks passed; 42 final delta/cake-management checks passed, including order/cake draft isolation, pending/terminal/hidden payment polling, customer search and bulk CSV review. Final screenshot capture also verifies the refined customer/bulk layouts. Test data and credentials are isolated; no real emails, checkouts, charges or refunds are sent.

The initial browser pass exposed an old fixture returning a different order ID than requested; the new identity check correctly rejected it. The fixture now returns the requested record. Cake-editor tests were updated to open the new disclosures and use the new labels. Final results supersede those diagnostic runs.

The [final screenshot gallery](admin-delta-evidence/README.md) contains 21 images covering the seven widths. Captures reset keyboard focus and scroll; accessibility features remain enabled. The 42 final checks include screenshot captures with the collapsed default cake editors.

## External verification still required

The user has not identified a separate staging URL. Vercel project metadata exists locally, but deployment credentials are absent; GitHub CLI authentication is invalid. No deployment, production promotion or scheduled email dispatch was performed.

1. Confirm GitHub **production** environment `PRODUCTION_SITE_URL` is the deployed HTTPS application URL and `CRON_SECRET` exactly matches that deployed application. The local comments are at `.env.local` lines 1, 16 and 47; local values do not configure GitHub Actions.
2. Publish the updated workflow to the default branch before expecting scheduled runs to use it. Verify its next run after configuration is confirmed.
3. Deploy develop to an identified staging environment with migrations 0034–0040. Use Stripe test mode and a mail sink to verify real open/expired/completed checkout flows, quote delivery/approval, invoices and scheduled dispatch.
4. Review the authenticated deployed pages and measure query behavior against representative scale before production promotion.

Local completion is not a claim that live operational restoration or staging verification has completed.
