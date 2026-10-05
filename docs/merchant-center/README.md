# Google Merchant Center policy pack

Prepared 5 October 2026 from the owner's instructions and existing public contact details.

## Documents

- [Printable PDF bundle](business-policies.pdf)
- [Printable HTML bundle](business-policies.html)
- [Returns, refunds and cake cancellations](returns-refunds-cancellations.md) — website path `/refund-policy`
- [Terms of service](terms-of-service.md) — `/terms`
- [Delivery and pickup policy](delivery-and-pickup.md) — `/delivery-information`
- [Privacy policy](privacy-policy.md) — `/privacy`
- [Business/contact information](business-contact-information.md) — `/contact`

The editable source is [policy-copy.json](policy-copy.json). Generate matching Markdown, HTML and PDF with:

```sh
node --experimental-strip-types scripts/prepare-merchant-policies.mjs --pdf
```

The `--apply` option updates only the existing `business` and `content` settings, after schema validation and a private backup. It requires `POLICY_CONTENT_UPDATE_AUTHORIZED=true` and SQL credentials for the intended environment. It preserves catalogue, orders, payment records and inventory. Content caches may take up to five minutes to refresh when updates are made directly to the database.

## Confirmed business profile

| Field | Value |
| --- | --- |
| Business name | Ndeeelicious Delight |
| Location | Halifax, Nova Scotia, Canada |
| Products | Custom cakes; frozen, ready-to-bake Nigerian-style meat pies, chicken pies and beef sausage rolls |
| Food-safety statement | Food Safety & Handler Certified — supplied by owner from the business profile |
| Email | ndidiamakaoseafiana@gmail.com |
| Phone | +19025803019 |
| Currency | CAD |
| Timezone | America/Halifax |

No certificate issuer/number, street address, opening hours, delivery charges or new processing promises have been invented. The food-safety statement is not a claim of Google or government endorsement. The existing Instagram and WhatsApp settings are preserved.

## Cake policy to enter

Wedding cakes: written cancellation notice at least **one calendar month** before scheduled delivery/collection. Other cakes: at least **one week (seven days)**. Cake payments already made are **non-refundable for customer cancellation/change of mind**, even with sufficient notice. Mandatory consumer remedies remain available. No automatic credit, exchange or rescheduling entitlement is promised.

In Merchant Center, use the cake policy for cake products only. Choose the applicable no-returns option for ordinary change-of-mind cake returns and use the published `/refund-policy` URL on the actual HTTPS domain. If other products have different policies, use a separate policy and a product return-policy label such as `cakes_only` to associate the cake policy with the appropriate products. Do not apply cake cancellation periods to pies or other non-cake products. Google supports distinct return policies and requires clear website disclosure. [Google return-policy setup](https://support.google.com/merchants/answer/14011730?hl=en).

Google normally needs accessible website information and policy URLs; the PDF is a copy for the owner and supporting documentation if requested. Publish the corresponding website pages and make sure the deployed site displays the same wording before submission. Footer policy links exist, and the checkout layout now links returns/cancellations, delivery, terms, privacy and contact. [Google checkout requirements](https://support.google.com/merchants/answer/9158778?hl=en).

## Still needed before submission

1. Confirm and verify the actual live HTTPS domain in Merchant Center. The local configuration uses localhost, which is not a submission URL.
2. Supply the address required for Google's business verification; only Halifax/NS/Canada was provided. Confirm collection address, public opening/support hours and the requested public visibility of any home address.
3. Confirm actual delivery areas, prices, order cutoffs, handling and transit times. There are currently **no active delivery zones** in the configured database. Do not advertise Halifax delivery merely because the bakery is based there. Configure the correct zones and match Merchant shipping settings to checkout. [Google shipping specification](https://support.google.com/merchants/answer/6324484?hl=en).
4. List products customers can purchase at the advertised fixed price. Do not submit a quote-only wedding/custom-cake estimate as a fixed-price purchasable offer. [Google store requirements](https://support.google.com/merchants/answer/12160471?hl=en), [custom-product guidance](https://support.google.com/merchants/answer/7162856?hl=en).
5. Check product names, CAD prices, stock, ingredients/allergens and genuine product imagery against the actual cakes/pies sold. Profile-copy updates do not replace or rename existing catalogue records or certify their food labelling.
6. Confirm applicable Nova Scotia tax settings with the owner. Province/timezone were updated; existing tax configuration was preserved.

This pack does not guarantee Merchant Center approval. The no-refund wording preserves non-excludable consumer remedies, consistent with [Canada's consumer guidance on refunds and defective goods](https://ised-isde.canada.ca/site/office-consumer-affairs/en/business-practices-and-consumer-concerns/refund-and-exchange).

## Verification

The project gate passed 110 regression and 58 functional tests, TypeScript, quality, CSS-token checks and production build. The final browser run passed 56 visual/accessibility checks across seven viewports and four themes. Seven public pages, checkout policy links and the printable bundle passed content/mobile smoke checks. The regenerated PDF contains ten pages. No Merchant submission or deployment was performed.

## Owner-supplied stockists

The owner supplied the product range and stockists from the business Instagram post on 5 October 2026. The ready-to-bake page links to Kalisimbi Shop (Halifax), Iyalode African Wholesales Market (Dartmouth), Chater Meat Market (Dartmouth) and Wazobia African Shop (Halifax). Contact each retailer for current stock, prices and hours. Store purchases are supported by that retailer. These locations do not establish bakery delivery zones. The cake-only cancellation rules remain unchanged.

Stockist update verification: the project gate again passed 110 regression and 58 functional tests plus TypeScript, quality and production build. The final browser run passed 56 visual/accessibility checks; the mobile smoke passed all seven public pages, four stockist links, checkout links and the printable bundle.
