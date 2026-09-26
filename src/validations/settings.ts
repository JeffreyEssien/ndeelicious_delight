import { z } from "zod";

const text = (maximum = 2_000) => z.string().trim().max(maximum);
const href = text(2_000).refine(
  (value) =>
    value.startsWith("/") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("tel:"),
  "Use a site path or a secure web, email, or phone link.",
);

export const businessSettingsSchema = z.object({
  businessName: text(120).min(2),
  contactEmail: z.union([z.literal(""), z.email().max(200)]),
  phone: text(40),
  whatsapp: text(40),
  address: text(300),
  country: z.literal("CA"),
  province: text(2).transform((value) => value.toUpperCase()),
  postalCode: text(7).transform((value) => value.toUpperCase()),
  locale: text(20).min(2),
  timezone: text(80).min(3),
  openingHours: text(500),
  currency: text(3)
    .length(3)
    .transform((value) => value.toUpperCase()),
  cakeLeadHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  instagramUrl: z.union([z.literal(""), z.url().max(500)]),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  orderMinimum: z.number().int().min(0).max(100_000_000),
  taxEnabled: z.boolean(),
  taxLabel: text(40).min(1),
  taxRegistrationNumber: text(50).default(""),
  taxRateBps: z.number().int().min(0).max(10_000),
  taxDelivery: z.boolean(),
});

const heroSchema = z.object({
  eyebrow: text(120),
  headline: text(300),
  supportingText: text(1_000),
  image: text(2_000).optional(),
  imageAlt: text(300).optional(),
});
const titleBodySchema = z.object({ title: text(160), body: text(1_500) });
const sectionHeadingSchema = z.object({ eyebrow: text(120), headline: text(300) });

export const storefrontContentSchema = z.object({
  global: z.object({
    announcement: z.object({ text: text(300), linkLabel: text(80), href }),
    navigation: z.array(z.object({ label: text(80), href })).max(12),
    footerDescription: text(1_000),
    newsletterTitle: text(200),
    newsletterText: text(1_000),
  }),
  home: z.object({
    hero: heroSchema.extend({
      primaryLabel: text(80),
      primaryHref: href,
      secondaryLabel: text(80),
      secondaryHref: href,
    }),
    intro: sectionHeadingSchema.extend({ body: text(1_500) }),
    categories: z
      .array(
        z.object({
          eyebrow: text(120),
          title: text(160),
          body: text(1_000),
          linkLabel: text(80),
          href,
          image: text(2_000),
          imageAlt: text(300),
        }),
      )
      .max(8),
    featured: sectionHeadingSchema.extend({ linkLabel: text(80) }),
    cakeFeature: sectionHeadingSchema.extend({
      body: text(1_500),
      steps: z.array(text(300)).max(12),
      buttonLabel: text(80),
      image: text(2_000),
      imageAlt: text(300),
    }),
    readyFeature: sectionHeadingSchema.extend({
      body: text(1_500),
      buttonLabel: text(80),
      image: text(2_000),
      imageAlt: text(300),
    }),
    gallery: sectionHeadingSchema,
    values: z.array(titleBodySchema).max(12),
  }),
  about: z.object({
    hero: heroSchema,
    story: sectionHeadingSchema.extend({ paragraphs: z.array(text(2_000)).max(12) }),
    values: z.array(titleBodySchema).max(12),
    cta: sectionHeadingSchema.extend({ buttonLabel: text(80) }),
  }),
  contact: z.object({ hero: heroSchema }),
  customCakes: z.object({ hero: heroSchema }),
  readyToBake: z.object({
    hero: heroSchema,
    section: sectionHeadingSchema,
    steps: z.array(titleBodySchema).max(12),
  }),
  delivery: z.object({
    hero: heroSchema,
    intro: sectionHeadingSchema.extend({ body: text(1_500) }),
    steps: z.array(titleBodySchema).max(12),
    pickup: sectionHeadingSchema.extend({ body: text(1_500) }),
  }),
  faq: z.object({
    hero: heroSchema,
    groups: z
      .array(
        z.object({
          title: text(160),
          questions: z.array(z.object({ question: text(300), answer: text(2_000) })).max(30),
        }),
      )
      .max(12),
  }),
  headers: z.object({ shop: heroSchema, pastries: heroSchema, cart: heroSchema, track: heroSchema }),
  shopBudget: z
    .object({
      eyebrow: text(120),
      headline: text(240),
      body: text(1_000),
      inputLabel: text(120),
      inputPlaceholder: text(80),
      buttonLabel: text(80),
      productsTitle: text(160),
      cakesTitle: text(160),
      emptyProducts: text(500),
      emptyCakes: text(500),
      recommendationLabel: text(120),
      disclaimer: text(500),
      rangeAriaLabel: text(200),
      productSingular: text(40),
      productPlural: text(40),
      resultPrefix: text(120),
      fromLabel: text(40),
      toLabel: text(40),
      upToLabel: text(40),
      clearLabel: text(80),
      catalogueEyebrow: text(120),
      cakesEyebrow: text(120),
      customizeLabel: text(80),
      validationError: text(200),
      presetTitle: text(160),
      presetBody: text(500),
    })
    .default({
      eyebrow: "Shop your way",
      headline: "Tell us your budget",
      body: "Choose a live price range or enter your own amount. We’ll show what fits, including custom cake ideas.",
      inputLabel: "My maximum budget",
      inputPlaceholder: "e.g. 75",
      buttonLabel: "Find my options",
      productsTitle: "Ready to order within your budget",
      cakesTitle: "Custom cakes we can build within your budget",
      emptyProducts: "No ready-to-order products currently fit this amount.",
      emptyCakes: "No fixed-price custom cake combination currently fits this amount.",
      recommendationLabel: "Budget cake idea",
      disclaimer:
        "Product totals and cake estimates exclude delivery and applicable taxes. Custom cake availability is confirmed by the bakery.",
      rangeAriaLabel: "Price ranges calculated from currently available products",
      productSingular: "product",
      productPlural: "products",
      resultPrefix: "Showing options",
      fromLabel: "from",
      toLabel: "to",
      upToLabel: "up to",
      clearLabel: "Clear budget",
      catalogueEyebrow: "Live catalogue",
      cakesEyebrow: "Built for your budget",
      customizeLabel: "Customize this cake",
      validationError: "Enter a budget greater than zero.",
      presetTitle: "Budget-friendly starting point loaded",
      presetBody: "We selected one available choice at every priced step. Review each choice and make it yours.",
    }),
  orderSuccess: z.object({
    eyebrow: text(120),
    headline: text(300),
    body: text(1_500),
    steps: z.array(titleBodySchema).max(12),
  }),
  product: z.object({
    deliveryTitle: text(160),
    deliveryText: text(500),
    preparationTitle: text(160),
    preparationText: text(500),
  }),
  policies: z.object({
    privacy: z.object({
      title: text(160),
      updated: text(100),
      eyebrow: text(120),
      sections: z.array(z.object({ heading: text(200), body: text(5_000) })).max(30),
    }),
    terms: z.object({
      title: text(160),
      updated: text(100),
      eyebrow: text(120),
      sections: z.array(z.object({ heading: text(200), body: text(5_000) })).max(30),
    }),
    refund: z.object({
      title: text(160),
      updated: text(100),
      eyebrow: text(120),
      sections: z.array(z.object({ heading: text(200), body: text(5_000) })).max(30),
    }),
  }),
});

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex colour.");
export const storeAppearanceSchema = z.object({
  useCustomColors: z.boolean(),
  colors: z.object({
    background: hexColor,
    surface: hexColor,
    text: hexColor,
    mutedText: hexColor,
    primary: hexColor,
    primaryDark: hexColor,
    accent: hexColor,
  }),
  contentWidth: z.enum(["compact", "standard", "wide"]),
  sectionSpacing: z.enum(["compact", "comfortable", "airy"]),
  cornerStyle: z.enum(["subtle", "soft", "rounded"]),
  productColumns: z.number().int().min(2).max(4),
});

export const storeCarouselSchema = z.object({
  enabled: z.boolean(),
  eyebrow: text(120),
  headline: text(240),
  body: text(1_000),
  productIds: z.array(z.uuid()).max(12),
  style: z.enum(["editorial", "cards", "spotlight"]),
  autoplay: z.boolean(),
  intervalMs: z.number().int().min(3_000).max(12_000),
  loop: z.boolean(),
  showPrices: z.boolean(),
  showAddToCart: z.boolean(),
  social: z
    .object({
      headline: text(120),
      callToAction: text(80),
      websiteUrl: text(300),
      format: z.enum(["square", "portrait", "story"]),
      template: z.enum(["berry", "cream", "bold"]),
      showLogo: z.boolean(),
      showPrice: z.boolean(),
    })
    .default({
      headline: "Made fresh for you",
      callToAction: "Order online",
      websiteUrl: "",
      format: "portrait",
      template: "berry",
      showLogo: true,
      showPrice: true,
    }),
});
