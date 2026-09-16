import { z } from "zod";
export const customerSchema=z.object({name:z.string().trim().min(2,"Tell us who the order is for."),email:z.string().trim().email("Enter a valid email address."),phone:z.string().transform(v=>v.replace(/\D/g,"")).pipe(z.string().min(10,"Enter a valid phone number."))});
export const deliverySchema=z.discriminatedUnion("fulfilment",[
  z.object({fulfilment:z.literal("pickup")}),
  z.object({fulfilment:z.literal("delivery"),zoneId:z.string().min(1),street:z.string().trim().min(5),area:z.string().trim().optional(),city:z.string().trim().min(2),notes:z.string().max(500).optional()})
]);
export const checkoutSchema=z.object({customer:customerSchema,delivery:deliverySchema,cart:z.array(z.object({productId:z.string().min(1),variantId:z.string().min(1),quantity:z.number().int().positive().max(50)})).min(1),couponCode:z.string().trim().max(30).optional()});
