import { checkoutSchema } from "@/validations/checkout";
import { calculateOrderQuote, CommerceError } from "@/features/checkout/pricing";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { getCoupon } from "@/lib/data/coupons";

export async function POST(request:Request){
  try{
    const body:unknown=await request.json();const parsed=checkoutSchema.safeParse(body);
    if(!parsed.success)return Response.json({error:"Please check the highlighted order details.",issues:parsed.error.flatten()},{status:400});
    const {cart,delivery,couponCode}=parsed.data;const [products,deliveryZones]=await Promise.all([getProducts(),getDeliveryZones()]);
    const zone=delivery.fulfilment==="delivery"?deliveryZones.find(z=>z.id===delivery.zoneId&&z.active):undefined;
    if(delivery.fulfilment==="delivery"&&!zone)return Response.json({error:"That delivery zone is unavailable."},{status:400});
    const coupon=await getCoupon(couponCode);if(couponCode&&!coupon)return Response.json({error:"That coupon is not valid."},{status:400});
    const quote=calculateOrderQuote({cart,products,fulfilment:delivery.fulfilment,deliveryFee:zone?.fee,coupon});
    return Response.json({quote});
  }catch(error){
    if(error instanceof SyntaxError)return Response.json({error:"The request body is invalid."},{status:400});
    if(error instanceof CommerceError)return Response.json({error:error.message,code:error.code},{status:error.code==="INSUFFICIENT_STOCK"?409:400});
    return Response.json({error:"We couldn’t calculate the order. Please try again."},{status:500});
  }
}
