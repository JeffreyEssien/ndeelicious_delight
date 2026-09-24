import type { Product } from "@/types";

export const products: Product[] = [
  {
    id: "p1", categoryId: "11111111-1111-4111-8111-111111111111", slug: "cake", name: "Cake", shortDescription: "Cake", description: "Cake", category: "CUSTOM_CAKES",
    price: 3800000, image: "/custom-cake.jpg", featured: true, status: "ACTIVE", stockQuantity: 8,
    lowStockThreshold: 3, variants: [{ id: "v3", name: "Large", priceAdjustment: 2700000, stockQuantity: 3 }],
    ingredients: "Flour", allergens: ["Wheat"],
  },
  {
    id: "p2", categoryId: "22222222-2222-4222-8222-222222222222", slug: "croissant", name: "Croissant", shortDescription: "Pastry", description: "Pastry", category: "PASTRIES",
    price: 450000, image: "/pastries.jpg", status: "ACTIVE", stockQuantity: 24, lowStockThreshold: 8,
    variants: [{ id: "v1", name: "Single", priceAdjustment: 0, stockQuantity: 24 }], ingredients: "Flour", allergens: ["Wheat"],
  },
  {
    id: "p4", categoryId: "22222222-2222-4222-8222-222222222222", slug: "danish", name: "Danish", shortDescription: "Pastry", description: "Pastry", category: "PASTRIES",
    price: 750000, image: "/pastries.jpg", status: "ACTIVE", stockQuantity: 6, lowStockThreshold: 5,
    variants: [{ id: "v1", name: "Single", priceAdjustment: 0, stockQuantity: 6 }], ingredients: "Flour", allergens: ["Wheat"],
  },
];
