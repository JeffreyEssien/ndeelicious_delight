# Fix log

A short running list of shipped fixes and what still needs doing on production. Add a line per PR.
The full history and plans live in `PROGRESS.md` and `implementation.md`.

## Production checklist (prod runs `main`)

- [ ] Release `dev` → `main`.
- [ ] Apply migrations to the production database, in order: 0055, 0056, 0057, 0058, 0059, 0060, 0061, 0062.
- [ ] Upgrade Next.js (critical RCE advisory on the current version).
- [ ] Stripe: work through `STRIPE_INTEGRATION_TODO.md`. The webhook is `https://www.ndeelicious.com/api/stripe/webhook`, on sandbox keys until launch.

## Shipped (PRs into `dev`)

| PR | What | Migration |
|----|------|-----------|
| #49–#55 | Stockists band, Find a store nav, Stripe payment badges, next delivery date, kitchen gallery, admin delivery redesign | |
| #56 | Real deletion | 0056 |
| #57–#59 | Find us section, Ready to bake spotlight | |
| #60 | Push notifications | 0057 |
| #61 | Payment stuck on pending: success page confirms with Stripe if the webhook is late | |
| #62–#63 | Orders page revival plus bell, order panel plus warm order emails | |
| #64 | Stock page revamp, reasons for stock adjustments | 0058 |
| #66 | Stripe embedded payment form (`ui_mode: "form"`) on `/pay` | |
| #67 | Orders can be marked ready before the 24-hour notice ends; the admin gets an "are you sure" reminder instead of a block | 0059 |
| #68 | Customers get an email for partial refunds; refund emails show the amounts | 0060 |
| #69 | Tax on products only. Delivery fees are never taxed, and the admin's delivery tax setting is gone | |
| #70 | Saving a pickup schedule that allows earlier pickups moves open pickup orders forward and emails those customers the new time | 0061 |
| #71 | Homepage cake section is now a grid of cake sub-category tiles; each photo rotates through that category's cakes | 0062 |
| #72 | "From the kitchen" is a shop counter: feature panel with a type menu (All, Ready to order, Cakes, Ready to bake) beside a row of photo-first products with quick add; Ready to order leads | |
| #74 | Website content editor rebuilt: page list, search across all text, plain field names showing where each appears, edit markers with undo, list editing, publish bar with Cmd/Ctrl+S; only fields the site uses | |
| #75 | Home Screen and push notification icons pointed at `/icon` and `/apple-icon`, which 404; they now use `/icon.png` and `/apple-icon.png` | |
| #77 | Order panel More menu no longer cut off. Emails now include a plain-text copy and a full HTML document (better inbox delivery), and failed emails save the mail server's own reason in `last_error` | |
| #78 | "Resend customer emails" now really resends: failed or waiting emails go now, otherwise the latest update is sent again (no repeat push). The admin is told the address it went to, or why it failed in plain words | |

## Good to know

- Lead time: checkout uses the longer of the shop-wide 24-hour minimum (`MIN_LEAD_TIME_HOURS`) and the product's or cake's own lead time. Each cake's lead time is set on the admin Cakes page.
- The next free migration number is 0063. Check other open branches before using it.
- The pickup time customers are told lives in `orders.preparation_ready_at`. `fulfilment_snapshot` can't be changed after the order is placed.
- Pre-existing biome format errors in `src/lib/auth/validation.test.ts` and `src/lib/supabase/config.ts` are not ours, so don't commit formatter changes to them. The `RouteContext`/`LayoutProps` tsc errors come from Next's generated types.
