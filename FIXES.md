# Fix log

A short running list of shipped fixes and what still needs doing on production. Add a line per PR.
The full history and plans live in `PROGRESS.md` and `implementation.md`.

## Production checklist (prod runs `main`)

- [ ] Release `dev` → `main`.
- [ ] Apply migrations to the production database, in order: 0055, 0056, 0057, 0058, 0059, 0060.
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

## Good to know

- Lead time: checkout uses the longer of the shop-wide 24-hour minimum (`MIN_LEAD_TIME_HOURS`) and the product's or cake's own lead time. Each cake's lead time is set on the admin Cakes page.
- The next free migration number is 0061. Check other open branches before using it.
- Pre-existing biome format errors in `src/lib/auth/validation.test.ts` and `src/lib/supabase/config.ts` are not ours, so don't commit formatter changes to them. The `RouteContext`/`LayoutProps` tsc errors come from Next's generated types.
