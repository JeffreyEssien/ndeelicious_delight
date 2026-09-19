export type Category = "CUSTOM_CAKES" | "PASTRIES" | "READY_TO_BAKE";
export type ProductStatus = "ACTIVE" | "OUT_OF_STOCK" | "DRAFT" | "ARCHIVED";

export type Product = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: Category;
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
};

export type ProductImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  storagePath?: string;
};
export type ProductVariant = {
  id: string;
  name: string;
  sku?: string;
  priceAdjustment: number;
  stockQuantity: number;
  active?: boolean;
};
export type CartLine = { productId: string; variantId: string; quantity: number };
export type Fulfilment = "delivery" | "pickup";
export type DeliveryZone = { id: string; name: string; fee: number; estimate: string; active: boolean };

export type CakeConfiguration = {
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
