"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CartLine, DeliveryZone, Product } from "@/types";

type Toast = {id:number;message:string};
export type StoreTheme = "berry"|"purple"|"sunrise";
type CartValue = {lines:CartLine[];count:number;open:boolean;setOpen:(v:boolean)=>void;add:(product:Product,variantId?:string,quantity?:number)=>void;update:(productId:string,variantId:string,quantity:number)=>void;remove:(productId:string,variantId:string)=>void;clear:()=>void;subtotal:number};
type ThemeValue = {theme:StoreTheme;setTheme:(theme:StoreTheme)=>void};
const CartContext=createContext<CartValue|null>(null);
const ToastContext=createContext<(message:string)=>void>(()=>{});
const ThemeContext=createContext<ThemeValue|null>(null);
const ProductsContext=createContext<Product[]>([]);
const DeliveryZonesContext=createContext<DeliveryZone[]>([]);

export function Providers({children,products,deliveryZones,initialTheme}:{children:React.ReactNode;products:Product[];deliveryZones:DeliveryZone[];initialTheme:StoreTheme}) {
  const [lines,setLines]=useState<CartLine[]>([]); const [open,setOpen]=useState(false); const [ready,setReady]=useState(false); const [toasts,setToasts]=useState<Toast[]>([]);const [theme,setTheme]=useState<StoreTheme>(initialTheme);
  useEffect(()=>{try{const saved=localStorage.getItem("ndee-cart-v1");if(saved)setLines(JSON.parse(saved));}catch{}setReady(true)},[]);
  useEffect(()=>{if(ready)localStorage.setItem("ndee-cart-v1",JSON.stringify(lines))},[lines,ready]);
  useEffect(()=>{document.documentElement.dataset.theme=theme},[theme]);
  const notify=(message:string)=>{const id=Date.now();setToasts(v=>[...v,{id,message}]);window.setTimeout(()=>setToasts(v=>v.filter(t=>t.id!==id)),2800)};
  const value=useMemo<CartValue>(()=>({lines,count:lines.reduce((n,l)=>n+l.quantity,0),open,setOpen,
    add(product,variantId=product.variants[0].id,quantity=1){setLines(current=>{const found=current.find(l=>l.productId===product.id&&l.variantId===variantId);return found?current.map(l=>l===found?{...l,quantity:l.quantity+quantity}:l):[...current,{productId:product.id,variantId,quantity}]});notify("Added to your basket.");},
    update(productId,variantId,quantity){setLines(v=>quantity<1?v.filter(l=>!(l.productId===productId&&l.variantId===variantId)):v.map(l=>l.productId===productId&&l.variantId===variantId?{...l,quantity}:l))},
    remove(productId,variantId){setLines(v=>v.filter(l=>!(l.productId===productId&&l.variantId===variantId)));notify("Removed from your basket.")},clear(){setLines([])},
    subtotal:lines.reduce((sum,line)=>{const p=products.find(x=>x.id===line.productId);const v=p?.variants.find(x=>x.id===line.variantId);return sum+(p?p.price+(v?.priceAdjustment??0):0)*line.quantity},0)
  }),[lines,open,products]);
  return <ProductsContext.Provider value={products}><DeliveryZonesContext.Provider value={deliveryZones}><ThemeContext.Provider value={{theme,setTheme}}><ToastContext.Provider value={notify}><CartContext.Provider value={value}>{children}<div className="toast-region" aria-live="polite">{toasts.map(t=><div className="toast" key={t.id}>✓ {t.message}</div>)}</div></CartContext.Provider></ToastContext.Provider></ThemeContext.Provider></DeliveryZonesContext.Provider></ProductsContext.Provider>;
}
export function useCart(){const v=useContext(CartContext);if(!v)throw new Error("useCart must be used inside Providers");return v}
export function useToast(){return useContext(ToastContext)}
export function useStoreTheme(){const value=useContext(ThemeContext);if(!value)throw new Error("useStoreTheme must be used inside Providers");return value}
export function useProducts(){return useContext(ProductsContext)}
export function useDeliveryZones(){return useContext(DeliveryZonesContext)}
