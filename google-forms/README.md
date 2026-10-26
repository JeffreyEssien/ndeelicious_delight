# Google Form product upload

A Google Form that creates shop products. Each response is sent by a Google Apps Script
([product-upload.gs](product-upload.gs)) to two server-to-server endpoints:

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /api/integrations/products` | JSON (prices in dollars) | Creates the product through the same `admin_save_product` RPC and validation as the admin editor |
| `POST /api/integrations/products/images` | multipart: `productId`, `altText`, `sortOrder`, `file` | Adds one photo (same rules as the admin upload) |

Both require `Authorization: Bearer <PRODUCT_IMPORT_API_KEY>`. Changes are recorded in the admin audit
log as the admin named by `PRODUCT_IMPORT_ADMIN_EMAIL`, through a five-minute session that is revoked
after every request.

## 1. Configure the app

Add to the Vercel project (Production) and redeploy:

```
PRODUCT_IMPORT_API_KEY=<at least 32 random characters, e.g. `openssl rand -hex 32`>
PRODUCT_IMPORT_ADMIN_EMAIL=<email of an active admin>
```

## 2. Create the form

1. Open <https://script.google.com> → **New project**, name it "Ndeeelicious product upload".
2. Replace `Code.gs` with the contents of `product-upload.gs`.
3. **Project Settings → Script properties**, add:
   - `API_BASE_URL` — `https://www.ndeelicious.com`
   - `API_KEY` — the same value as `PRODUCT_IMPORT_API_KEY`
   - `NOTIFY_EMAIL` — optional; where results are emailed (defaults to your Google account)
4. Select `createProductForm` and click **Run**. Approve the permissions (Forms, Drive, external
   requests, email). The execution log prints the form's edit and share links.
5. Open the edit link and add a question: **File upload**, titled exactly `Photos`, allow
   *Image* files only, up to 10 files, max 10 MB each. (Apps Script cannot create this question type.)
   Photos above 4 MB are skipped because Vercel rejects larger request bodies.

Only share the form with people who should add products: anyone who can submit it can publish to the shop.
File upload questions already require respondents to sign in with Google.

## Answer format

- **Category** decides how the product sells, matching the admin editor: *Ready to bake* items are bake-at-home,
  *Ready to order* and *Custom cakes* are sold in packs or sizes.
- **Sizes / packs** — one per line, `Name | Price | Pack size or serves | Stock`; only the name is required.
  Blank means one option at the main price with a pack size of 1.
- **Sub-category** must match an existing sub-category name for that category.
- **Publish** defaults to Draft. Drafts are reviewed and published from **Admin → Products**.
- The product link is generated from the name; repeats get `-2`, `-3`, … appended.

After every submission an email reports the created product, or the reason it was rejected
(for example "description: Add a full description."). Fix the answer and submit again.

## Calling the API directly

```bash
curl -X POST "$SITE/api/integrations/products" \
  -H "Authorization: Bearer $PRODUCT_IMPORT_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Vanilla Cupcakes","category":"PASTRIES","shortDescription":"Soft vanilla cupcakes.",
       "description":"Baked fresh with real vanilla.","price":18,"status":"DRAFT",
       "variants":[{"name":"Box of 6","price":18,"packQuantity":6},{"name":"Box of 12","price":32.5,"packQuantity":12}]}'
```

All fields are listed in [`src/validations/product-import.ts`](../src/validations/product-import.ts).
