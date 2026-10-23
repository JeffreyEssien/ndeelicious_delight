import type { TaxClass } from "@/features/tax/types";

export type Category = "CUSTOM_CAKES" | "PASTRIES" | "READY_TO_BAKE";
export type Collection = { id: string; parent: Category; name: string; slug: string; sortOrder: number };
export type ProductStatus = "ACTIVE" | "OUT_OF_STOCK" | "DRAFT" | "ARCHIVED";

export type Product = {
  id: string;
  categoryId?: string;
  shoppingMode?: "READY_TO_ORDER" | "MADE_TO_ORDER" | "READY_TO_BAKE";
  preparationHours?: number;
  taxClass?: TaxClass;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: Category;
  collectionId?: string;
  price: number;
  discountPrice?: number;
  compareAtPrice?: number;
  sku?: string;
  image: string;
  images?: ProductImage[];
  imagePosition?: string;
  badge?: string;
  featured?: boolean;
  trackInventory?: boolean;
  status: ProductStatus;
  stockQuantity: number;
  lowStockThreshold: number;
  variants: ProductVariant[];
  ingredients: string;
  allergens: string[];
  storageInstructions?: string;
  preparationInstructions?: string;
  optionGroups?: CakeOptionGroup[];
  cakeLayers?: Record<string, CakeSizeLayer[]>;
};

// A cake size can offer several layer counts (e.g. 8" as 2 or 3 layers); each layer count
// carries its own price adjustment (in cents) on top of the size's selling price.
export type CakeSizeLayer = { layers: number; priceAdjustment: number };

export type CakeOptionGroup = { id: string; name: string; choices: string[]; required: boolean };

export type ProductImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  storagePath?: string;
};
export type ProductVariant = {
  retiredAt?: string | null;
  sortOrder?: number;
  trackInventory?: boolean | null;
  packQuantity?: number | null;
  id: string;
  name: string;
  sku?: string;
  priceAdjustment: number;
  stockQuantity: number;
  active?: boolean;
};
export type CartSelection = { group: string; value: string };
export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
  selections?: CartSelection[];
};
export type Fulfilment = "delivery" | "pickup";
export type DeliveryZone = {
  postalCodePrefixes?: string[];
  freeDeliveryThreshold?: number | null;
  customerNote?: string;
  sameDayEligible?: boolean;
  sortOrder?: number;
  id: string;
  name: string;
  fee: number;
  minimumOrder: number;
  estimate: string;
  active: boolean;
};

export type CakeConfiguration = {
  optionIds?: Partial<Record<"occasion" | "size" | "flavour" | "filling" | "design", string>>;
  cakeTypeId: string;
  occasion: string;
  size: string;
  flavour: string;
  filling: string;
  design: string;
  colours: string;
  inscription: string;
  deliveryDate: string;
  referenceName: string;
  customerName?: string;
  email?: string;
  phone?: string;
  customerNote?: string;
};

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "FAILED"
  | "QUOTE_REQUIRED";
export type Order = {
  id: string;
  customer: string;
  email: string;
  total: number;
  status: OrderStatus;
  date: string;
  items: number;
  fulfilment: Fulfilment;
};
