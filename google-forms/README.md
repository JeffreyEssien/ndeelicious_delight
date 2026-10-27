# Google Form product upload

A Google Form that creates shop products. Each response is sent by a Google Apps Script
([product-upload.gs](product-upload.gs)) to two server-to-server endpoints:

| Endpoint | Body | Purpose |
| --- | --- | --- |
| `POST /api/integrations/products` | JSON (prices in dollars) | Creates the product through the same `admin_save_product` RPC and validation as the admin editor |
| `POST /api/integrations/products/images` | multipart: `productId`, `altText`, `sortOrder`, `file` | Adds one photo (same rules as the admin upload) |

Both require `Authorization: Bearer <PRODUCT_IMPORT_API_KEY>` and `X-Submitted-By: <admin email>`.
The email must be in `PRODUCT_IMPORT_ADMIN_EMAILS` and belong to an active admin; the change is recorded
in the admin audit log as that admin, through a five-minute session that is revoked after every request.
When only one admin is listed, `X-Submitted-By` may be left out.

## 1. Configure the app

Add to the Vercel project (Production) and redeploy:

```
PRODUCT_IMPORT_API_KEY=<at least 32 random characters, e.g. `openssl rand -hex 32`>
PRODUCT_IMPORT_ADMIN_EMAILS=<admin emails, comma separated, e.g. owner@example.com,manager@example.com>
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
5. Open the edit link and add a question: **File upload**, titled `Photos` (any title works), allow
   *Image* files only, up to 10 files, max 10 MB each. (Apps Script cannot create this question type.)
   Photos that are over 4 MB (Vercel's request limit) or in iPhone's HEIC format are sent as a JPEG copy
   made by Google Drive, at most 2000 px on the longest side. Image links to other websites are not
   converted, so they must already be a JPG, PNG, WebP or AVIF under 4 MB. A Drive photo the shop refuses
   is retried once as the JPEG copy.

The form records each respondent's verified Google email and sends it as `X-Submitted-By`, so only
the admins listed in `PRODUCT_IMPORT_ADMIN_EMAILS` can add products, each under their own name. A response
from anyone else is rejected, and the result email says so. Each admin must use the Google account whose
email matches their admin login.

## Answer format

- **Category** decides how the product sells, matching the admin editor: *Ready to bake* items are bake-at-home,
  *Ready to order* and *Custom cakes* are sold in packs or sizes.
- **Sizes / packs** — one per line, `Name | Price | Pack size or serves | Stock`; only the name is required.
  Blank means one option at the main price with a pack size of 1.
- **Sub-category** must match an existing sub-category name for that category.
- **Preparation time** is how long the product takes to make, in hours and minutes; blank means none.
  Every order also waits the shop's 24-hour minimum lead time, and customers get whichever is longer.
- **Publish** defaults to Draft. Drafts are reviewed and published from **Admin → Products**.
- The product link is generated from the name; repeats get `-2`, `-3`, … appended.

After every submission an email reports the created product, or the reason it was rejected
(for example "description: Add a full description.").

## Retrying a failed submission

Every answer and photo stays in the form's **Responses** tab and the form owner's Google Drive, so a
failed submission is never lost. The script remembers each failure, and the failure email offers two ways
to retry:

- **Fix and resubmit:** the email links to that response. Open it, correct the answer, and submit; the
  import runs again with the original photos.
- **Retry as is** (for example after the site was briefly down): open the script and run
  `retryFailedSubmissions`. `listFailedSubmissions` prints every failure and its reason to the execution log.

A response that already created a product is never imported twice: editing or retrying it again only
sends an "Already added" email. Photos that failed on a product that was added are added in the admin.

## Updating an existing form

Paste the latest `product-upload.gs` over `Code.gs` and save. Then, depending on when the form was made:

- Forms that still ask for **Lead time (hours)**: run `updatePreparationQuestions` once. That question
  becomes *Preparation time (hours)*, keeping earlier answers, and a *Preparation time (minutes)* question
  is added after it. The form's links stay the same.

Forms created before retrying existed: run `enableFixLinks` once to turn on the fix links. It enables
response editing, so respondents also see Google's "Edit your response" link after submitting.

## Calling the API directly

```bash
curl -X POST "$SITE/api/integrations/products" \
  -H "Authorization: Bearer $PRODUCT_IMPORT_API_KEY" -H "X-Submitted-By: owner@example.com" \
  -H "Content-Type: application/json" \
  -d '{"name":"Vanilla Cupcakes","category":"PASTRIES","shortDescription":"Soft vanilla cupcakes.",
       "description":"Baked fresh with real vanilla.","price":18,"status":"DRAFT",
       "variants":[{"name":"Box of 6","price":18,"packQuantity":6},{"name":"Box of 12","price":32.5,"packQuantity":12}]}'
```

All fields are listed in [`src/validations/product-import.ts`](../src/validations/product-import.ts).
