import type { CartLine, Fulfilment, Product } from "@/types";

export type CouponRule = {
  id?: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minimumOrder: number;
  maximumDiscount?: number;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number;
  usageCount?: number;
  active: boolean;
  productIds?: string[];
  categoryIds?: string[];
};

export type OrderQuote = {
  lines: Array<{ productId:string; variantId:string; name:string; variantName:string; quantity:number; unitPrice:number; lineTotal:number }>;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  grandTotal: number;
  couponCode?: string;
};

export class CommerceError extends Error {
  constructor(public code:string,message:string){super(message);this.name="CommerceError"}
}

export function calculateOrderQuote(input:{
  cart:CartLine[]; products:Product[]; fulfilment:Fulfilment; deliveryFee?:number;
  coupon?:CouponRule; now?:Date;
}):OrderQuote {
  if(!input.cart.length)throw new CommerceError("EMPTY_CART","Your basket is empty.");
  const lines=input.cart.map(line=>{
    if(!Number.isInteger(line.quantity)||line.quantity<1)throw new CommerceError("INVALID_QUANTITY","Choose a valid quantity.");
    const product=input.products.find(p=>p.id===line.productId);
    if(!product||product.status==="DRAFT"||product.status==="ARCHIVED")throw new CommerceError("PRODUCT_UNAVAILABLE","A product in your basket is no longer available.");
    const variant=product.variants.find(v=>v.id===line.variantId&&v.stockQuantity>0);
    if(!variant||product.status==="OUT_OF_STOCK")throw new CommerceError("VARIANT_UNAVAILABLE",`${product.name} is currently unavailable.`);
    const available=Math.min(product.stockQuantity,variant.stockQuantity);
    if(line.quantity>available)throw new CommerceError("INSUFFICIENT_STOCK",`Only ${available} of ${product.name} remain.`);
    const unitPrice=(product.discountPrice??product.price)+variant.priceAdjustment;
    if(!Number.isSafeInteger(unitPrice)||unitPrice<0)throw new CommerceError("INVALID_PRICE","This item’s price needs review.");
    return {productId:product.id,variantId:variant.id,name:product.name,variantName:variant.name,quantity:line.quantity,unitPrice,lineTotal:unitPrice*line.quantity};
  });
  const subtotal=lines.reduce((total,line)=>total+line.lineTotal,0);
  const discount=input.coupon?calculateDiscount(input.coupon,subtotal,lines,input.products,input.now??new Date()):0;
  const deliveryFee=input.fulfilment==="delivery"?input.deliveryFee??0:0;
  if(deliveryFee<0||!Number.isSafeInteger(deliveryFee))throw new CommerceError("INVALID_DELIVERY_FEE","The delivery fee is invalid.");
  return {lines,subtotal,discount,deliveryFee,grandTotal:subtotal-discount+deliveryFee,couponCode:input.coupon?.code};
}

export function calculateDiscount(coupon:CouponRule,subtotal:number,lines:OrderQuote["lines"],products:Product[],now=new Date()){
  if(!coupon.active)throw new CommerceError("COUPON_INACTIVE","That coupon is not active.");
  if(coupon.startsAt&&now<coupon.startsAt)throw new CommerceError("COUPON_NOT_STARTED","That coupon is not active yet.");
  if(coupon.expiresAt&&now>coupon.expiresAt)throw new CommerceError("COUPON_EXPIRED","That coupon has expired.");
  if(coupon.usageLimit!==undefined&&(coupon.usageCount??0)>=coupon.usageLimit)throw new CommerceError("COUPON_USED_UP","That coupon has reached its usage limit.");
  if(subtotal<coupon.minimumOrder)throw new CommerceError("COUPON_MINIMUM",`Spend more to use ${coupon.code}.`);
  let eligible=subtotal;
  if(coupon.productIds?.length)eligible=lines.filter(l=>coupon.productIds!.includes(l.productId)).reduce((n,l)=>n+l.lineTotal,0);
  if(coupon.categoryIds?.length)eligible=lines.filter(l=>coupon.categoryIds!.includes(products.find(p=>p.id===l.productId)?.category??"")).reduce((n,l)=>n+l.lineTotal,0);
  if(eligible===0)throw new CommerceError("COUPON_NOT_APPLICABLE","That coupon does not apply to these items.");
  const raw=coupon.type==="PERCENTAGE"?Math.floor(eligible*coupon.value/100):coupon.value;
  return Math.min(raw,coupon.maximumDiscount??raw,eligible);
}

export const previewCoupon:CouponRule={code:"SWEET10",type:"PERCENTAGE",value:10,minimumOrder:1000000,maximumDiscount:500000,active:true};
