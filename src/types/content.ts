export type BusinessSettings = {
  businessName: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  address: string;
  openingHours: string;
  currency: string;
  cakeLeadHours: number;
  instagramUrl: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  orderMinimum: number;
};

export type HeroContent = {
  eyebrow: string;
  headline: string;
  supportingText: string;
  image?: string;
  imageAlt?: string;
};

export type StorefrontContent = {
  global: {
    announcement: { text: string; linkLabel: string; href: string };
    navigation: Array<{ label: string; href: string }>;
    footerDescription: string;
    newsletterTitle: string;
    newsletterText: string;
  };
  home: {
    hero: HeroContent & {
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel: string;
      secondaryHref: string;
    };
    intro: { eyebrow: string; headline: string; body: string };
    categories: Array<{
      eyebrow: string;
      title: string;
      body: string;
      linkLabel: string;
      href: string;
      image: string;
      imageAlt: string;
    }>;
    featured: { eyebrow: string; headline: string; linkLabel: string };
    cakeFeature: {
      eyebrow: string;
      headline: string;
      body: string;
      steps: string[];
      buttonLabel: string;
      image: string;
      imageAlt: string;
    };
    readyFeature: {
      eyebrow: string;
      headline: string;
      body: string;
      buttonLabel: string;
      image: string;
      imageAlt: string;
    };
    gallery: { eyebrow: string; headline: string };
    values: Array<{ title: string; body: string }>;
  };
  about: {
    hero: HeroContent;
    story: { eyebrow: string; headline: string; paragraphs: string[] };
    values: Array<{ title: string; body: string }>;
    cta: { eyebrow: string; headline: string; buttonLabel: string };
  };
  contact: { hero: HeroContent };
  customCakes: { hero: HeroContent };
  readyToBake: {
    hero: HeroContent;
    section: { eyebrow: string; headline: string };
    steps: Array<{ title: string; body: string }>;
  };
  delivery: {
    hero: HeroContent;
    intro: { eyebrow: string; headline: string; body: string };
    steps: Array<{ title: string; body: string }>;
    pickup: { eyebrow: string; headline: string; body: string };
  };
  faq: { hero: HeroContent; groups: Array<{ title: string; questions: Array<{ question: string; answer: string }> }> };
  headers: Record<"shop" | "pastries" | "cart" | "track", HeroContent>;
  orderSuccess: {
    eyebrow: string;
    headline: string;
    body: string;
    steps: Array<{ title: string; body: string }>;
  };
  product: {
    deliveryTitle: string;
    deliveryText: string;
    preparationTitle: string;
    preparationText: string;
  };
  policies: Record<
    "privacy" | "terms" | "refund",
    { title: string; updated: string; eyebrow: string; sections: Array<{ heading: string; body: string }> }
  >;
};

export type CakeOptionType = "occasion" | "size" | "flavour" | "filling" | "design";

export type CakeOption = {
  id: string;
  type: CakeOptionType;
  name: string;
  description: string;
  priceAdjustment: number;
  quoteRequired: boolean;
  active: boolean;
  sortOrder: number;
};

export type CakeConfigurationData = {
  options: CakeOption[];
  leadTimeHours: number;
};

export type PublicReview = {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
};
