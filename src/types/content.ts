import type { z } from "zod";
import type {
  businessSettingsSchema,
  storeAppearanceSchema,
  storeCarouselSchema,
  storefrontContentSchema,
  marketingExportSchema,
} from "@/validations/settings";

export type BusinessSettings = Omit<z.infer<typeof businessSettingsSchema>, "deliveryTaxMode" | "fulfilmentSchedule"> &
  Partial<Pick<z.infer<typeof businessSettingsSchema>, "deliveryTaxMode" | "fulfilmentSchedule">>;
export type StoreAppearance = z.infer<typeof storeAppearanceSchema>;
export type StoreCarousel = z.infer<typeof storeCarouselSchema>;
export type MarketingExport = z.infer<typeof marketingExportSchema>;

export type StorefrontContent = z.infer<typeof storefrontContentSchema>;

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
  fulfilment?: {
    schedule: import("@/features/fulfilment/types").FulfilmentSchedule | null;
    areas: import("@/features/fulfilment/types").DeliveryArea[];
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
  };
  relationships?: { cakeTypeId: string; optionId: string }[];
  options: CakeOption[];
  cakeTypes: import("@/validations/cake-type").CakeType[];
  timezone: string;
};

export type PublicReview = {
  id: string;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
  verifiedPurchase: boolean;
};
