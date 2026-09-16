import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { isActiveAdmin } from "@/lib/auth/admin-auth";
import { createClient } from "@/lib/supabase/server";

const schema=z.object({name:z.string().trim().min(2).max(150),slug:z.string().trim().min(2).max(180),shortDescription:z.string().trim().max(500),category:z.enum(["CUSTOM_CAKES","PASTRIES","READY_TO_BAKE"]),price:z.number().int().min(0),stockQuantity:z.number().int().min(0)});
const slugs={CUSTOM_CAKES:"custom-cakes",PASTRIES:"pastries",READY_TO_BAKE:"ready-to-bake"} as const;
export async function POST(request:Request){
  if(!isSameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403});
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return Response.json({error:"Check the product details."},{status:400});
  const db=await createClient();const {data:user}=await db.auth.getUser();if(!user.user||!(await isActiveAdmin(db,user.user.id)))return Response.json({error:"Unauthorized."},{status:401});
  const {data:category}=await db.from("categories").select("id").eq("slug",slugs[input.data.category]).single();if(!category)return Response.json({error:"Product category is missing."},{status:400});
  const {data:product,error}=await db.from("products").insert({category_id:category.id,name:input.data.name,slug:input.data.slug,short_description:input.data.shortDescription||input.data.name,description:input.data.shortDescription||input.data.name,base_price:input.data.price,status:"DRAFT",stock_quantity:input.data.stockQuantity,low_stock_threshold:5}).select("id").single();
  if(error||!product)return Response.json({error:error?.message??"Product could not be saved."},{status:500});
  const {error:variantError}=await db.from("product_variants").insert({product_id:product.id,name:"Standard",price_adjustment:0,stock_quantity:input.data.stockQuantity});
  if(variantError)return Response.json({error:"Product was saved, but its default variant was not."},{status:500});
  return Response.json({ok:true,id:product.id},{status:201});
}
