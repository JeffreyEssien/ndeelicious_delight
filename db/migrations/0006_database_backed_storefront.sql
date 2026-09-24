-- Database-owned storefront content and custom-cake configuration.

insert into public.site_settings (key, value)
values (
  'business',
  '{
    "businessName": "Ndeeelicious Delight",
    "contactEmail": "",
    "phone": "",
    "whatsapp": "",
    "address": "Lagos, Nigeria",
    "openingHours": "",
    "currency": "NGN",
    "cakeLeadHours": 72,
    "instagramUrl": ""
  }'::jsonb
)
on conflict (key) do nothing;

insert into public.site_settings (key, value)
values (
  'content',
  $content$
  {
    "global": {
      "announcement": {"text":"Delivery is available in configured Lagos zones","linkLabel":"View details","href":"/delivery-information"},
      "navigation": [
        {"label":"Shop","href":"/shop"},
        {"label":"Custom cakes","href":"/custom-cakes"},
        {"label":"Ready to bake","href":"/ready-to-bake"},
        {"label":"Our story","href":"/about"}
      ],
      "footerDescription":"Beautifully made cakes and pastries for Lagos celebrations, slow mornings and everything between.",
      "newsletterTitle":"A little sweetness, occasionally",
      "newsletterText":"New bakes, celebration inspiration and first dibs."
    },
    "home": {
      "hero": {
        "eyebrow":"Handmade in Lagos",
        "headline":"Made for life’s\nsweetest moments.",
        "supportingText":"Celebration cakes, fresh pastries and oven-ready favourites, made slowly and shared joyfully.",
        "image":"/hero-bakery.jpg",
        "imageAlt":"Handmade celebration cake and pastries",
        "primaryLabel":"Shop the bakery",
        "primaryHref":"/shop",
        "secondaryLabel":"Build your cake",
        "secondaryHref":"/custom-cakes"
      },
      "intro":{"eyebrow":"Choose your treat","headline":"A little something\nfor every moment.","body":"From centrepiece cakes to warm-from-the-oven mornings, everything is made with intention."},
      "categories":[
        {"eyebrow":"Celebrations","title":"Custom cakes","body":"Designed around your story, flavour and table.","linkLabel":"Build yours","href":"/custom-cakes","image":"/custom-cake.jpg","imageAlt":"Custom celebration cake"},
        {"eyebrow":"Fresh daily","title":"Morning pastries","body":"Flaky layers, baked golden every morning.","linkLabel":"Shop pastries","href":"/shop?category=PASTRIES","image":"/pastries.jpg","imageAlt":"Fresh artisan pastries"},
        {"eyebrow":"At home","title":"Ready to bake","body":"Bakery mornings, straight from your own oven.","linkLabel":"Fill the freezer","href":"/ready-to-bake","image":"/ready-to-bake.jpg","imageAlt":"Ready-to-bake croissants"}
      ],
      "featured":{"eyebrow":"From the counter","headline":"Today’s favourites","linkLabel":"See everything"},
      "cakeFeature":{"eyebrow":"Yours, in cake form","headline":"A centrepiece that tastes as good as it looks.","body":"Tell us the occasion, the mood and the flavours you love. Our guided builder makes the details simple.","steps":["Choose your size and flavour","Share your colours and inspiration","Pick a date—we’ll handle the magic"],"buttonLabel":"Start your cake","image":"/custom-cake.jpg","imageAlt":"Bespoke Ndeeelicious Delight cake"},
      "readyFeature":{"eyebrow":"A better kind of convenience","headline":"Your kitchen.\nOur pastry.","body":"Proof overnight, bake in the morning, and take all the credit. Each box includes simple step-by-step instructions.","buttonLabel":"Explore ready to bake","image":"/ready-to-bake.jpg","imageAlt":"Box of croissants ready to bake"},
      "gallery":{"eyebrow":"From the kitchen","headline":"Freshly made, lately."},
      "values":[
        {"title":"Small-batch, always","body":"Made by hand with ingredients we’re proud to use."},
        {"title":"Freshness first","body":"Timed carefully so every order arrives at its best."},
        {"title":"Made with feeling","body":"The little details matter, because your moments do."}
      ]
    },
    "about": {
      "hero":{"eyebrow":"Our story","headline":"Made slowly.\nShared joyfully.","supportingText":"Ndeeelicious Delight began with a simple belief: the things we gather around should feel as thoughtful as the moments themselves.","image":"/pastries.jpg","imageAlt":"Fresh pastries in the Ndeeelicious Delight bakery"},
      "story":{"eyebrow":"From our kitchen","headline":"Flavour first.\nBeauty, always.","paragraphs":["We bake in small batches from our Lagos kitchen, choosing good ingredients and giving every dough, sponge and buttercream the time it deserves.","Our cakes are expressive but considered. Our pastries are deeply buttery and properly laminated. Everything is made to taste as wonderful as it looks."]},
      "values":[{"title":"Craft over shortcuts","body":"Patient methods, handmade finishes and real attention."},{"title":"Warmth in every detail","body":"From first click to final slice, it should feel personal."},{"title":"Joy without the fuss","body":"Beautiful ordering that stays refreshingly simple."}],
      "cta":{"eyebrow":"Taste the difference","headline":"Something lovely is waiting.","buttonLabel":"Shop the bakery"}
    },
    "contact":{"hero":{"eyebrow":"We’d love to hear from you","headline":"Let’s talk cake.","supportingText":"Questions, order help or a wonderfully ambitious idea—we’re listening."}},
    "customCakes":{"hero":{"eyebrow":"Made around your moment","headline":"Your story,\nin cake.","supportingText":"Choose the details you love and leave the making to us.","image":"/custom-cake.jpg","imageAlt":"Bespoke custom celebration cake"}},
    "readyToBake":{"hero":{"eyebrow":"Bakery mornings, at home","headline":"Proof. Bake.\nTake the credit.","supportingText":"Hand-laminated and frozen at exactly the right moment for golden, flaky pastry whenever the craving arrives.","image":"/ready-to-bake.jpg","imageAlt":"Ready-to-bake croissant box"},"section":{"eyebrow":"Fill the freezer","headline":"Ready when you are"},"steps":[{"title":"Proof overnight","body":"Move from freezer to tray before bed."},{"title":"Brush & bake","body":"Follow the preparation instructions provided with your product."},{"title":"Enjoy warm","body":"Best served straight from your oven."}]},
    "delivery":{"hero":{"eyebrow":"From our kitchen to your table","headline":"Delivery, made clear.","supportingText":"We prepare every order around an agreed date and handle it carefully on the journey."},"intro":{"eyebrow":"Current delivery zones","headline":"Where we go","body":"Fees are calculated from the zone selected at checkout."},"steps":[{"title":"Choose your date","body":"Available dates appear during ordering. Custom-cake lead time follows the current bakery setting."},{"title":"We confirm the window","body":"You’ll receive the expected delivery or collection time with your confirmation."},{"title":"Follow your order","body":"Status updates keep you informed from preparation through delivery."}],"pickup":{"eyebrow":"Prefer to collect?","headline":"Pickup is always free.","body":"Select pickup at checkout. We’ll send the collection details after confirmation."}},
    "faq":{"hero":{"eyebrow":"Helpful answers","headline":"Frequently asked.","supportingText":"Everything worth knowing before your first bite."},"groups":[{"title":"Ordering","questions":[{"question":"How far ahead should I order?","answer":"Lead times depend on the product and current bakery capacity. The custom-cake builder always shows the active minimum notice."},{"question":"Can I change an order after placing it?","answer":"Contact us as soon as possible. Changes depend on how far your order has progressed and may affect the final price."}]},{"title":"Delivery & collection","questions":[{"question":"Where do you deliver?","answer":"The delivery page lists every currently active zone and its live fee."},{"question":"Can I collect my order?","answer":"Yes. Choose pickup at checkout and we’ll confirm the collection window and directions."}]},{"title":"Cakes & ingredients","questions":[{"question":"Can you copy another baker’s cake exactly?","answer":"We use inspiration images as a direction and create an original interpretation in our own style."},{"question":"Do you cater for allergies?","answer":"Allergens are listed on product pages. Contact us before ordering if you need more detail."}]}]},
    "headers":{"shop":{"eyebrow":"The bakery counter","headline":"Find your favourite.","supportingText":"Made in small batches, packed with care and ready for your table."},"pastries":{"eyebrow":"Baked fresh","headline":"Morning pastries.","supportingText":"Buttery layers and flavours drawn from the live bakery catalogue."},"cart":{"eyebrow":"Almost yours","headline":"Your basket.","supportingText":""},"track":{"eyebrow":"From oven to your door","headline":"Track your order.","supportingText":"Enter the details from your confirmation email."}},
    "orderSuccess":{"eyebrow":"Order received","headline":"Your order is looking lovely.","body":"Your order has been saved and is awaiting payment confirmation.","steps":[{"title":"Payment confirmation","body":"A receipt will be sent by email."},{"title":"We begin preparing","body":"The bakery confirms your fulfilment window."},{"title":"Follow every update","body":"Track progress with your order number."}]},
    "product":{"deliveryTitle":"Careful Lagos delivery","deliveryText":"Choose your active zone at checkout","preparationTitle":"Made to order","preparationText":"Freshly prepared for your confirmed date"},
    "policies":{"privacy":{"title":"Privacy policy","updated":"15 September 2026","eyebrow":"Last updated","sections":[{"heading":"What we collect","body":"We collect information needed to process orders, provide support and improve the bakery experience, including contact, delivery and purchase information."},{"heading":"How we use it","body":"We use your details to fulfil orders, send transactional updates, prevent fraud and respond to enquiries. Marketing messages are sent only when you choose to receive them."},{"heading":"Your choices","body":"You can request access, correction or deletion of eligible personal information by contacting us."},{"heading":"Keeping information safe","body":"We use appropriate access controls and trusted service providers. Payment card information is handled by our payment provider and is not stored by Ndeeelicious Delight."}]},"terms":{"title":"Terms of service","updated":"15 September 2026","eyebrow":"Last updated","sections":[{"heading":"Orders","body":"An order is confirmed after valid payment or, for quoted cakes, after written acceptance and the required payment. Please review names, dates and contact information carefully."},{"heading":"Custom work","body":"Inspiration images guide the direction of an original Ndeeelicious Delight design. Handmade work naturally varies and exact colour matching cannot be guaranteed."},{"heading":"Changes and cancellations","body":"Contact us promptly. Eligibility depends on notice and preparation already completed. Custom and perishable goods may have limited cancellation rights."},{"heading":"Availability","body":"We may contact you if an ingredient or product becomes unavailable. We will offer a suitable alternative or refund where appropriate."}]},"refund":{"title":"Refund policy","updated":"15 September 2026","eyebrow":"Clear and considered","sections":[{"heading":"If something isn’t right","body":"Contact us within 24 hours of delivery with your order number and clear photographs. We review quality concerns fairly and promptly."},{"heading":"Perishable products","body":"Because our products are made fresh and often personalized, change-of-mind returns are not generally possible. This does not affect remedies for products that arrive damaged or materially incorrect."},{"heading":"Cancellations","body":"Refund eligibility depends on the notice provided and preparation already completed. Custom design deposits may become non-refundable once work begins."}]}}
  }
  $content$::jsonb
)
on conflict (key) do nothing;

insert into public.custom_cake_options (type, name, description, price_adjustment, quote_required, active, sort_order)
select values.*
from (
  values
    ('occasion', 'Birthday', null, 0, false, true, 0),
    ('occasion', 'Wedding', null, 0, false, true, 1),
    ('occasion', 'Anniversary', null, 0, false, true, 2),
    ('occasion', 'Baby shower', null, 0, false, true, 3),
    ('occasion', 'Graduation', null, 0, false, true, 4),
    ('occasion', 'Corporate', null, 0, false, true, 5),
    ('occasion', 'Just because', null, 0, false, true, 6)
) as values(type, name, description, price_adjustment, quote_required, active, sort_order)
where not exists (
  select 1 from public.custom_cake_options existing
  where existing.type = values.type and existing.name = values.name
);

create unique index if not exists custom_cake_options_type_name_idx
  on public.custom_cake_options(type, name);
