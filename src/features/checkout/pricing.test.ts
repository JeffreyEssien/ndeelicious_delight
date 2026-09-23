import { describe,expect,it } from "vitest";import { calculateOrderQuote,CommerceError,previewCoupon } from "./pricing";import { products } from "@/lib/mock-data";
const cart=[{productId:"p2",variantId:"v1",quantity:3}];
describe("calculateOrderQuote",()=>{
  it("uses server catalogue prices and adds delivery",()=>{const quote=calculateOrderQuote({cart,products,fulfilment:"delivery",deliveryFee:250000});expect(quote.subtotal).toBe(1350000);expect(quote.grandTotal).toBe(1600000)});
  it("never adds a fee for pickup",()=>{const quote=calculateOrderQuote({cart,products,fulfilment:"pickup",deliveryFee:999999});expect(quote.deliveryFee).toBe(0)});
  it("applies capped percentage coupons",()=>{const quote=calculateOrderQuote({cart:[{productId:"p1",variantId:"v3",quantity:1}],products,fulfilment:"pickup",coupon:previewCoupon});expect(quote.discount).toBe(500000)});
  it("rejects insufficient stock",()=>{expect(()=>calculateOrderQuote({cart:[{productId:"p4",variantId:"v1",quantity:7}],products,fulfilment:"pickup"})).toThrowError(CommerceError)});
  it("does not impose stock limits when inventory tracking is disabled",()=>{const unlimited={...products[1],trackInventory:false,stockQuantity:0,variants:products[1].variants.map(variant=>({...variant,stockQuantity:0}))};const quote=calculateOrderQuote({cart:[{productId:unlimited.id,variantId:unlimited.variants[0].id,quantity:50}],products:[unlimited],fulfilment:"pickup"});expect(quote.lines[0].quantity).toBe(50)});
  it("rejects expired coupons",()=>{expect(()=>calculateOrderQuote({cart,products,fulfilment:"pickup",coupon:{...previewCoupon,expiresAt:new Date("2025-01-01")},now:new Date("2026-01-01")})).toThrowError(/expired/) });
});
