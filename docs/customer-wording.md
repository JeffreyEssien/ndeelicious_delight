# Owner-managed customer wording

Customer-facing interface copy is editable at **Admin → Content → Customer interface and email wording**. Choose a screen/email group, search for the original wording, edit its value, then save. Existing page sections still manage headlines, paragraphs, policies, navigation, stockists and links. Business settings manage contact details; products and cake options keep their own editors.

The additional controls cover footer labels, storefront buttons and accessibility descriptions, catalogue/cart/checkout states, delivery and quote forms, tracking, reviews, document labels, downloadable PDF labels, page titles and customer email wording. Customer email groups include order lifecycle updates, cake requests/quotes, newsletter welcome messages, shared documents and review invitations. Administrator operational and authentication messages are outside this customer-copy scope.

Placeholders such as `{name}`, `{number}` and `{value1}` insert current customer/order details. Preserve the placeholders needed in your message. Wording is plain text: React escapes it on pages, email renderers escape it in HTML, and the PDF renderer escapes PDF syntax. Changing display copy leaves payment states, identifiers and financial amounts unchanged.

Defaults merge with existing settings, so older content records remain compatible and new fields appear without reseeding the database. Saving uses the existing authenticated settings endpoint and storefront cache invalidation.

## Verification — 6 October 2026

- Full project gate passed: quality/CSS audit, **120 regression tests**, **58 API tests**, TypeScript and production build.
- Tests cover legacy setting compatibility, bounded text values, whitespace preservation, saved overrides/default merging, literal placeholder values, central error wording, escaped email copy and editable PDF labels with unchanged amounts.
- Real admin browser: edited a footer heading, saved, reloaded the editor, and verified the public homepage used the saved wording.
- Edited newsletter wording was delivered to a local TLS SMTP capture and remained HTML escaped. No external email was sent.
- Homepage, shop, cake builder, checkout and content editor were checked at 320px and 1440px without horizontal overflow or browser exceptions.
- Test wording was restored, the test subscriber/limiter removed, and temporary sessions revoked. Immutable audit records were retained: automatic approval review rejected their deletion. Existing owner content and commerce records were preserved.

This verification does not replace the remaining production deployment, live-payment and real-inbox launch checks recorded in the production closure audit.
