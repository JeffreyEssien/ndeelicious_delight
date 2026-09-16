import type { Product } from "@/types";import { ProductCard } from "./product-card";
export function ProductGrid({items}:{items:Product[]}){return <div className="product-grid">{items.map(p=><ProductCard product={p} key={p.id}/>)}</div>}
