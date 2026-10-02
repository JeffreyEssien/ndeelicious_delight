import type { Product } from "@/types";
import { ProductCard } from "./product-card";
export function ProductGrid({ items }: { items: Product[] }) {
  return (
    <div className="product-grid">
      {items.map((p, index) => (
        <ProductCard product={p} eager={index < 4} key={p.id} />
      ))}
    </div>
  );
}
