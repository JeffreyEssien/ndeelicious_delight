# Browser test environment

The responsive suite runs its public storefront coverage against the local app by default. Authenticated and tokenized screens must use an isolated staging environment; never use a production session or production document link.

Set these values in the local shell or the GitHub `staging` environment:

- `PLAYWRIGHT_BASE_URL`: isolated staging origin. Omit it to let Playwright start the local development server.
- `PLAYWRIGHT_ISOLATED_ENVIRONMENT=true`: required for external targets or privileged fixtures after verifying the database, Stripe test mode and safe mail configuration. The configured production canonical origin is rejected even with this flag.
- `PLAYWRIGHT_ADMIN_STORAGE_STATE`: Playwright storage-state JSON, or a path to a JSON file, for a dedicated test admin.
- `PLAYWRIGHT_QUOTE_RESPONSE_PATH`: optional tokenized quote-response path from isolated fixture data.
- `PLAYWRIGHT_DOCUMENT_PATH`: optional tokenized receipt or invoice path from isolated fixture data.

The isolated catalogue should publish an enabled 12-product carousel and include a product with 12 images so the fixture-backed versions of those stress cases run. The suite still verifies the thumbnail-rail CSS contract without changing database data.

Run `npm run test:e2e:update` only when an intentional visual change requires new baselines. Review all 28 storefront images before committing them.

Responsive/axe tests suppress analytics ingestion so synthetic visits do not change business metrics. Analytics API ingestion has separate functional tests. Invalid storage-state paths fail before a browser starts.

The cake-type, pack and Budget Match acceptance tests use local sample data. Start
`node e2e/fixture-server.mjs`, then run the app on port 3100 with:

```sh
NDEE_BROWSER_FIXTURES=true \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4545 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-key \
SUPABASE_SERVICE_ROLE_KEY=fixture-service-key \
ADMIN_AUTH_SECRET=isolated-ndee-browser-secret-32-characters \
NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
STRIPE_SECRET_KEY= SMTP_HOST= SMTP_USER= SMTP_PASSWORD= npm run dev -- --port 3100
```

Run the customer tests before the owner test, which changes local fixture data:

```sh
NDEE_BROWSER_FIXTURES=true PLAYWRIGHT_BASE_URL=http://localhost:3100 \
PLAYWRIGHT_ISOLATED_ENVIRONMENT=true npx playwright test e2e/budget-results.spec.ts --project=phone-375
NDEE_BROWSER_FIXTURES=true PLAYWRIGHT_BASE_URL=http://localhost:3100 \
PLAYWRIGHT_ISOLATED_ENVIRONMENT=true npx playwright test e2e/admin-configuration.spec.ts --project=desktop
```

The customer test explicitly loops through 320, 360, 375, 390 and 430 pixels and
captures both full-page and viewport result screenshots under `test-results/`.
The owner test signs a session using the fixture secret and exercises the actual
admin pages and API save paths. The fixture server contains no remote database
connection or production secrets. Restart it to restore sample data.

The commerce admin suite also checks delivery saves/reloads, duplicate prefix rejection,
postal checkout and real quote totals, and actual PNG/ZIP download bytes with image/logo
failure handling. Run it on `phone-375` and `desktop`:

```sh
NDEE_BROWSER_FIXTURES=true PLAYWRIGHT_BASE_URL=http://localhost:3100 \
PLAYWRIGHT_ISOLATED_ENVIRONMENT=true npx playwright test e2e/commerce-admin.spec.ts --project=phone-375 --workers=1
```

The five-width customer loop uses 375×812, 390×844 and 430×932 for the corresponding phones.
Snapshots are under `test-results/`; they are generated artifacts, not production data.
