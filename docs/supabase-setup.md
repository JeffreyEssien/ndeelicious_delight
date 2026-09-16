# Supabase setup

The application is wired for Supabase Postgres and passwordless admin email OTP.

## 1. Add project credentials

Copy these values from the Supabase project **Connect** dialog into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
ADMIN_EMAIL=owner@example.com
ADMIN_NAME=Ndeeelicious Owner
```

`SUPABASE_SERVICE_ROLE_KEY` is used only in trusted server routes and maintenance scripts. It must never be prefixed with `NEXT_PUBLIC_` or exposed to the browser.

## 2. Apply the database migrations

Run these in order using the Supabase SQL editor or CLI:

1. `db/migrations/0001_initial.sql`
2. `db/migrations/0002_supabase_auth.sql`

The second migration links application admins to `auth.users`, enables RLS, grants public read-only catalogue access, and restricts operational tables to active admins.

Seed the current editable catalogue and configuration:

```bash
npm run db:seed
```

## 3. Configure email OTP

In **Authentication → Email Templates → Magic Link**, use `{{ .Token }}` instead of `{{ .ConfirmationURL }}`. A minimal template is:

```html
<h2>Your Ndeeelicious Delight admin code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">{{ .Token }}</p>
<p>If you did not request this code, you can ignore this email.</p>
```

For production, configure custom SMTP, keep the resend interval at least 60 seconds, and set a short OTP expiry such as 10 minutes.

## 4. Create and approve the first admin

Fill `ADMIN_EMAIL` and `ADMIN_NAME` in `.env.local`, then create and approve the owner in one idempotent command:

```bash
npm run admin:bootstrap
```

The command creates the Supabase Auth identity if needed and links it to the application allowlist. The equivalent manual SQL is:

```sql
insert into public.admins (auth_user_id, email, name, role)
select id, email, 'Ndeeelicious Owner', 'OWNER'
from auth.users
where email = 'owner@example.com';
```

The login endpoint sets `shouldCreateUser: false`, so entering an unknown email never creates an account. Both the Auth user and the active `admins` row are required.

## 5. Configure URLs

Under **Authentication → URL Configuration**, set the production Site URL and add local development URLs as allowed redirects. The numeric OTP flow does not depend on a redirect callback, but correct URL configuration is still required for other Supabase Auth emails.

## 6. Verify

Start the app, visit `/admin/login`, request a code with the approved email, and enter the six digits. `/admin/*` should redirect signed-out or unauthorized visitors back to the login page.

Run the complete local verification suite with:

```bash
npm run check
```

The storefront catalogue, checkout order creation, order tracking, custom cake requests, contact form, newsletter, and admin mutations are backed by Supabase. Payment remains `PENDING_PAYMENT` until Stripe keys and webhook handling are configured.
