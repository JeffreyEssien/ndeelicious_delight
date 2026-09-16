import { calculateCakeQuote } from "@/features/cakes/pricing";
import { CommerceError } from "@/features/checkout/pricing";
import { cakeConfigurationSchema } from "@/validations/cake";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request:Request){
  try{
    if(!isSameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403});
    const body:unknown=await request.json();const parsed=cakeConfigurationSchema.safeParse(body);
    if(!parsed.success)return Response.json({error:"Please complete the cake details.",issues:parsed.error.flatten()},{status:400});
    const quote=calculateCakeQuote(parsed.data);const service=createServiceClient();
    const {data:customer,error:customerError}=await service.from("customers").upsert({email:parsed.data.email.toLowerCase(),name:parsed.data.customerName,phone:parsed.data.phone},{onConflict:"email"}).select("id").single();
    if(customerError)throw customerError;const requestNumber=`CC-${Date.now().toString().slice(-7)}`;
    const {error}=await service.from("custom_cake_orders").insert({request_number:requestNumber,customer_id:customer.id,customer_name:parsed.data.customerName,email:parsed.data.email.toLowerCase(),phone:parsed.data.phone,configuration:parsed.data,requested_date:parsed.data.deliveryDate,estimated_total:quote.estimatedTotal,status:quote.quoteRequired?"QUOTE_REQUIRED":"DRAFT",customer_note:parsed.data.customerNote});
    if(error)throw error;
    return Response.json({requestNumber,quote:{estimatedTotal:quote.estimatedTotal,quoteRequired:quote.quoteRequired,earliestDate:quote.earliestDate.toISOString()}},{status:201});
  }catch(error){
    if(error instanceof SyntaxError)return Response.json({error:"The request body is invalid."},{status:400});
    if(error instanceof CommerceError)return Response.json({error:error.message,code:error.code},{status:400});
    return Response.json({error:"We couldn’t price this cake. Please try again."},{status:500});
  }
}
