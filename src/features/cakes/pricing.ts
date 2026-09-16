import { cakeOptions } from "@/lib/mock-data";
import type { CakeConfiguration } from "@/types";
import { CommerceError } from "@/features/checkout/pricing";

export function calculateCakeQuote(config:CakeConfiguration,input:{now?:Date;leadTimeHours?:number}={}){
  for(const key of ["occasion","size","flavour","filling","design"] as const)if(!config[key])throw new CommerceError("INCOMPLETE_CAKE",`Choose a ${key} for your cake.`);
  const size=cakeOptions.sizes.find(x=>x.name===config.size);const flavour=cakeOptions.flavours.find(x=>x.name===config.flavour);const filling=cakeOptions.fillings.find(x=>x.name===config.filling);const design=cakeOptions.designs.find(x=>x.name===config.design);
  if(!size||!flavour||!filling||!design)throw new CommerceError("INVALID_CAKE_OPTION","One of the selected cake options is unavailable.");
  const now=input.now??new Date();const requested=new Date(`${config.deliveryDate}T12:00:00`);const earliest=new Date(now.getTime()+(input.leadTimeHours??72)*60*60*1000);
  if(!config.deliveryDate||Number.isNaN(requested.getTime())||requested<earliest)throw new CommerceError("INVALID_CAKE_DATE","Choose a date with enough preparation time.");
  const estimatedTotal=size.price+flavour.price+filling.price+design.price;
  return {estimatedTotal,quoteRequired:config.size==="Two tier"||config.design==="Floral garden",earliestDate:earliest};
}
