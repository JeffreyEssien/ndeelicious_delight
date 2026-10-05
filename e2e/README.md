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
