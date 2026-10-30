// What the owner can edit, page by page, in the order it appears on the website. Only text the
// site actually shows is listed here; anything else in saved content is kept as it is.

export type FieldKind = "text" | "long" | "image" | "link";
export type FieldSpec = {
  key: string;
  label: string;
  hint?: string;
  kind?: FieldKind;
  max?: number;
  /** For images: the key of the matching photo description. */
  alt?: string;
};
export type ListSpec = {
  key: string;
  label: string;
  hint?: string;
  /** Name of one item, e.g. "question". */
  item: string;
  /** The field shown as each item's title while it is folded. */
  title?: string;
  /** Fields of each item, or "text"/"long" for a plain list of sentences. */
  fields: FieldSpec[] | "text" | "long";
  lists?: ListSpec[];
  max: number;
};
export type SectionSpec = {
  /** Path under the page; omit when the fields sit directly on the page. */
  key?: string;
  label: string;
  where: string;
  fields?: FieldSpec[];
  lists?: ListSpec[];
};
export type PageSpec = {
  key: string;
  label: string;
  description: string;
  group: "pages" | "site" | "wording";
  href?: string;
  sections: SectionSpec[];
};

const eyebrow = (hint = "The small line above the heading."): FieldSpec => ({
  key: "eyebrow",
  label: "Small heading",
  hint,
  max: 120,
});
const headline = (label = "Heading"): FieldSpec => ({
  key: "headline",
  label,
  hint: "Press Enter to start a new line.",
  kind: "long",
  max: 300,
});
const intro: FieldSpec = { key: "supportingText", label: "Intro text", kind: "long", max: 1000 };
const body = (label = "Text", max = 1500): FieldSpec => ({ key: "body", label, kind: "long", max });
const button = (key = "buttonLabel", label = "Button text"): FieldSpec => ({ key, label, max: 80 });
const photo = (label = "Photo"): FieldSpec => ({ key: "image", label, kind: "image", alt: "imageAlt" });
const pageTop = (where = "The banner at the top of the page.", withPhoto = false): SectionSpec => ({
  key: "hero",
  label: "Top of the page",
  where,
  fields: [eyebrow(), headline(), intro, ...(withPhoto ? [photo("Banner photo")] : [])],
});
const steps = (label: string, where: string): ListSpec => ({
  key: "steps",
  label,
  hint: where,
  item: "step",
  title: "title",
  fields: [
    { key: "title", label: "Step title", max: 160 },
    { key: "body", label: "Step text", kind: "long", max: 1500 },
  ],
  max: 12,
});
const policy = (key: string, label: string): SectionSpec => ({
  key,
  label,
  where: `The ${label.toLowerCase()} page.`,
  fields: [
    eyebrow(),
    { key: "title", label: "Page title", max: 160 },
    { key: "updated", label: "Last updated", hint: "For example: Updated 1 October 2026.", max: 100 },
  ],
  lists: [
    {
      key: "sections",
      label: "Sections",
      item: "section",
      title: "heading",
      fields: [
        { key: "heading", label: "Section heading", max: 200 },
        { key: "body", label: "Section text", kind: "long", max: 5000 },
      ],
      max: 30,
    },
  ],
});

export const contentPages: PageSpec[] = [
  {
    key: "home",
    label: "Homepage",
    description: "The first page customers see.",
    group: "pages",
    href: "/",
    sections: [
      {
        key: "intro",
        label: "Welcome section",
        where: "Right under the big photo slides.",
        fields: [eyebrow(), headline(), body("Welcome text")],
      },
      {
        label: "Shop by category",
        where: "The large photo cards under the welcome section.",
        lists: [
          {
            key: "categories",
            label: "Category cards",
            item: "card",
            title: "title",
            fields: [
              eyebrow("The small label on the photo."),
              { key: "title", label: "Card title", max: 160 },
              body("Card text", 1000),
              button("linkLabel", "Link text"),
              { key: "href", label: "Opens", kind: "link" },
              photo("Card photo"),
            ],
            max: 8,
          },
        ],
      },
      {
        key: "featured",
        label: "Featured products",
        where: "The row of products you mark as featured.",
        fields: [eyebrow(), { key: "headline", label: "Heading", max: 300 }, button("linkLabel", "Link text")],
      },
      {
        key: "cakeFeature",
        label: "Cake categories",
        where: "The cake category tiles. Photos come from your cakes.",
        fields: [eyebrow(), headline(), body("Short intro (optional)"), button("buttonLabel", "Link text")],
      },
      {
        key: "readyFeature",
        label: "Ready to bake spotlight",
        where: "The ready-to-bake band with a photo.",
        fields: [eyebrow(), headline(), body(), button(), photo()],
      },
      {
        key: "gallery",
        label: "From the kitchen",
        where: "The shop counter with the type menu.",
        fields: [eyebrow(), { key: "headline", label: "Heading", max: 300 }],
      },
      {
        label: "Why customers love us",
        where: "The short promises near the bottom.",
        lists: [
          {
            key: "values",
            label: "Promises",
            item: "promise",
            title: "title",
            fields: [{ key: "title", label: "Title", max: 160 }, body("Text")],
            max: 12,
          },
        ],
      },
      {
        key: "hero",
        label: "Google and link previews",
        where: "Not shown on the page. Google and shared links use it.",
        fields: [
          {
            key: "supportingText",
            label: "Website description",
            hint: "One or two sentences about the bakery.",
            kind: "long",
            max: 1000,
          },
        ],
      },
    ],
  },
  {
    key: "about",
    label: "Our story",
    description: "The founder's story and vision.",
    group: "pages",
    href: "/about",
    sections: [
      {
        key: "founder",
        label: "Meet the founder",
        where: "The first section, with the founder's photo.",
        fields: [
          eyebrow(),
          headline(),
          { key: "name", label: "Name", max: 80 },
          { key: "role", label: "Title", max: 160 },
          { key: "motto", label: "Motto", max: 300 },
          { key: "lead", label: "Opening line", kind: "long", max: 600 },
          photo("Founder photo"),
        ],
        lists: [
          { key: "paragraphs", label: "Story", item: "paragraph", fields: "long", max: 12 },
          {
            key: "highlights",
            label: "Highlights",
            item: "highlight",
            title: "title",
            fields: [{ key: "title", label: "Title", max: 160 }, body("Text")],
            max: 6,
          },
        ],
      },
      {
        key: "vision",
        label: "Our vision",
        where: "The second section.",
        fields: [
          eyebrow(),
          headline(),
          { key: "statement", label: "Vision statement", kind: "long", max: 600 },
          { key: "closing", label: "Closing line", kind: "long", max: 400 },
          { key: "signOff", label: "Sign-off", hint: "For example: With love,", max: 80 },
          { key: "signature", label: "Signed by", max: 80 },
          { key: "signatureRole", label: "Signer's title", max: 160 },
        ],
        lists: [{ key: "paragraphs", label: "Vision text", item: "paragraph", fields: "long", max: 12 }],
      },
      {
        key: "hero",
        label: "Tagline and photo",
        where: "The band near the bottom of the page.",
        fields: [eyebrow(), headline(), intro, photo()],
      },
      {
        key: "cta",
        label: "Shop button",
        where: "The last section of the page.",
        fields: [eyebrow(), { key: "headline", label: "Heading", max: 300 }, button()],
      },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    description: "How customers reach you.",
    group: "pages",
    href: "/contact",
    sections: [
      {
        key: "hero",
        label: "Contact page",
        where: "The banner and the text next to the form.",
        fields: [
          eyebrow("The small line on the banner."),
          { key: "supportingText", label: "Text next to the form", kind: "long", max: 1000 },
          photo("Banner photo"),
        ],
      },
    ],
  },
  {
    key: "customCakes",
    label: "Cakes",
    description: "The cakes page.",
    group: "pages",
    href: "/custom-cakes",
    sections: [pageTop()],
  },
  {
    key: "readyToBake",
    label: "Ready to bake",
    description: "Frozen pies and rolls, and where to buy them.",
    group: "pages",
    href: "/ready-to-bake",
    sections: [
      pageTop("The banner at the top of the page.", true),
      {
        key: "section",
        label: "How it works",
        where: "The heading above the baking steps.",
        fields: [eyebrow(), { key: "headline", label: "Heading", max: 300 }],
      },
      { label: "Baking steps", where: "The numbered steps.", lists: [steps("Steps", "Shown in order.")] },
      {
        label: "Where to buy",
        where: "The stores that stock your products. Also shown on the homepage.",
        lists: [
          {
            key: "stockists",
            label: "Stores",
            item: "store",
            title: "name",
            fields: [
              { key: "name", label: "Store name", max: 120 },
              { key: "city", label: "City", max: 120 },
              { key: "address", label: "Address (optional)", max: 200 },
              { key: "phone", label: "Phone (optional)", max: 40 },
              { key: "url", label: "Map or website link", kind: "link" },
            ],
            max: 20,
          },
        ],
      },
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    description: "How delivery and pickup work.",
    group: "pages",
    href: "/delivery-information",
    sections: [
      pageTop(),
      {
        key: "intro",
        label: "Introduction",
        where: "Under the banner.",
        fields: [eyebrow(), headline(), body()],
      },
      { label: "How delivery works", where: "The numbered steps.", lists: [steps("Steps", "Shown in order.")] },
      {
        key: "pickup",
        label: "Pickup",
        where: "The pickup section.",
        fields: [eyebrow(), headline(), body()],
      },
    ],
  },
  {
    key: "faq",
    label: "FAQ",
    description: "Questions customers often ask.",
    group: "pages",
    href: "/faq",
    sections: [
      pageTop(),
      {
        label: "Questions",
        where: "Grouped by topic.",
        lists: [
          {
            key: "groups",
            label: "Topics",
            item: "topic",
            title: "title",
            fields: [{ key: "title", label: "Topic name", max: 160 }],
            lists: [
              {
                key: "questions",
                label: "Questions",
                item: "question",
                title: "question",
                fields: [
                  { key: "question", label: "Question", max: 300 },
                  { key: "answer", label: "Answer", kind: "long", max: 2000 },
                ],
                max: 30,
              },
            ],
            max: 12,
          },
        ],
      },
    ],
  },
  {
    key: "headers",
    label: "Shop and basket",
    description: "The tops of the shop, basket and tracking pages.",
    group: "pages",
    href: "/shop",
    sections: [
      { ...pageTop("The top of the shop page."), key: "shop", label: "Shop" },
      { ...pageTop("The top of the ready to order page."), key: "pastries", label: "Ready to order" },
      { ...pageTop("The top of the basket."), key: "cart", label: "Basket" },
      { ...pageTop("The top of the order tracking page."), key: "track", label: "Track an order" },
    ],
  },
  {
    key: "orderSuccess",
    label: "Order confirmation",
    description: "What customers see after paying.",
    group: "pages",
    sections: [
      {
        label: "Thank-you message",
        where: "The page shown after payment.",
        fields: [eyebrow(), headline(), body()],
        lists: [steps("What happens next", "Shown as numbered steps.")],
      },
    ],
  },
  {
    key: "product",
    label: "Product pages",
    description: "The notes shown on every product.",
    group: "pages",
    sections: [
      {
        label: "Delivery note",
        where: "Under the add to basket button.",
        fields: [
          { key: "deliveryTitle", label: "Title", max: 160 },
          { key: "deliveryText", label: "Text", kind: "long", max: 500 },
        ],
      },
      {
        label: "Preparation note",
        where: "Under the delivery note.",
        fields: [
          { key: "preparationTitle", label: "Title", max: 160 },
          { key: "preparationText", label: "Text", kind: "long", max: 500 },
        ],
      },
    ],
  },
  {
    key: "policies",
    label: "Policies",
    description: "Privacy, terms and refunds.",
    group: "pages",
    sections: [policy("privacy", "Privacy policy"), policy("terms", "Terms"), policy("refund", "Refund policy")],
  },
  {
    key: "global",
    label: "Menu and footer",
    description: "On every page.",
    group: "site",
    sections: [
      {
        label: "Menu",
        where: "The links in the header and footer.",
        lists: [
          {
            key: "navigation",
            label: "Menu links",
            item: "link",
            title: "label",
            fields: [
              { key: "label", label: "Link text", max: 80 },
              { key: "href", label: "Opens", kind: "link" },
            ],
            max: 12,
          },
        ],
      },
      {
        label: "Footer",
        where: "The bottom of every page.",
        fields: [{ key: "footerDescription", label: "About the bakery", kind: "long", max: 1000 }],
      },
      {
        label: "Newsletter",
        where: "The sign-up box on the homepage and in the footer.",
        fields: [
          { key: "newsletterTitle", label: "Heading", max: 200 },
          { key: "newsletterText", label: "Text", kind: "long", max: 1000 },
        ],
      },
    ],
  },
  {
    key: "shopBudget",
    label: "Budget finder",
    description: "The shop-by-budget tool on the shop pages.",
    group: "site",
    href: "/shop",
    sections: [
      {
        label: "Heading",
        where: "The top of the budget finder.",
        fields: [
          eyebrow(),
          { key: "headline", label: "Heading", max: 240 },
          body("Intro text", 1000),
          { key: "moneyNote", label: "Price note", max: 300 },
        ],
      },
      {
        label: "Budget box",
        where: "Where customers type their budget.",
        fields: [
          { key: "inputLabel", label: "Box label", max: 120 },
          { key: "inputPlaceholder", label: "Example in the box", max: 80 },
          button("buttonLabel", "Button text"),
          { key: "clearLabel", label: "Clear button", max: 80 },
          { key: "validationError", label: "Message for an empty budget", max: 200 },
        ],
      },
      {
        label: "Results",
        where: "What shows after a search.",
        fields: [
          { key: "productsTitle", label: "Products heading", max: 160 },
          { key: "cakesTitle", label: "Cakes heading", max: 160 },
          { key: "catalogueEyebrow", label: "Products small heading", max: 120 },
          { key: "cakesEyebrow", label: "Cakes small heading", max: 120 },
          { key: "emptyProducts", label: "No products found", kind: "long", max: 500 },
          { key: "emptyCakes", label: "No cakes found", kind: "long", max: 500 },
          { key: "closestPrefix", label: "Closest options note", max: 200 },
          { key: "raiseBudgetLabel", label: "Show closest button", max: 100 },
          { key: "viewAllLabel", label: "View all link", hint: "Keep {count} in the text.", max: 120 },
          { key: "disclaimer", label: "Small print", kind: "long", max: 500 },
        ],
      },
      {
        label: "Cake suggestion",
        where: "The suggested cake that fits a budget.",
        fields: [
          { key: "recommendationLabel", label: "Label", max: 120 },
          { key: "customizeLabel", label: "Button text", max: 80 },
          { key: "presetTitle", label: "Message title", max: 160 },
          { key: "presetBody", label: "Message text", kind: "long", max: 500 },
        ],
      },
      {
        label: "Small words",
        where: "Used inside sentences and filters.",
        fields: [
          { key: "resultPrefix", label: "Results start with", max: 120 },
          { key: "fromLabel", label: "from", max: 40 },
          { key: "toLabel", label: "to", max: 40 },
          { key: "upToLabel", label: "up to", max: 40 },
          { key: "withinLabel", label: "within", max: 80 },
          { key: "productSingular", label: "product (one)", max: 40 },
          { key: "productPlural", label: "products (many)", max: 40 },
          { key: "optionSingular", label: "option (one)", max: 40 },
          { key: "optionPlural", label: "options (many)", max: 40 },
          { key: "segmentLabel", label: "Filter label (for screen readers)", max: 120 },
          { key: "allLabel", label: "All filter", max: 60 },
          { key: "readyLabel", label: "Ready to order filter", max: 60 },
          { key: "customCakesLabel", label: "Cakes filter", max: 60 },
          { key: "rangeAriaLabel", label: "Price ranges label (for screen readers)", max: 200 },
        ],
      },
    ],
  },
];

export const wordingPage: PageSpec = {
  key: "customerText",
  label: "Buttons, labels and emails",
  description: "Every small piece of wording, grouped by screen.",
  group: "wording",
  sections: [],
};

/** Friendly names for the wording groups. */
export function wordingGroupName(group: string) {
  const named: Record<string, string> = {
    emails: "Order emails",
    "Page: (storefront)": "Homepage",
    "Page: ready-to-bake": "Ready to bake page",
    "Page: delivery-information": "Delivery page",
    "Page: contact": "Contact page",
    "Page: custom-cakes": "Cakes page",
    "Page: Product": "Product page",
    "Page: Review": "Review page",
    "page titles": "Page titles (browser tabs)",
    "not found": "Page not found",
    errors: "Error messages",
  };
  if (named[group]) return named[group];
  const plain = group.replace(/^Page: /, "");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** Pages customers can be sent to, offered when filling in a link. */
export const sitePages = [
  ["/", "Homepage"],
  ["/shop", "Shop"],
  ["/shop?category=PASTRIES", "Ready to order"],
  ["/custom-cakes", "Cakes"],
  ["/ready-to-bake", "Ready to bake"],
  ["/about", "Our story"],
  ["/contact", "Contact"],
  ["/delivery-information", "Delivery"],
  ["/faq", "FAQ"],
  ["/track-order", "Track an order"],
] as const;
