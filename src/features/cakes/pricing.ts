import type { CakeConfiguration } from "@/types";
import type { CakeOption } from "@/types/content";
import { CommerceError } from "@/features/checkout/pricing";

export function calculateCakeQuote(config:CakeConfiguration,options:CakeOption[],input:{now?:Date;leadTimeHours?:number}={}){
  for(const key of ["occasion","size","flavour","filling","design"] as const)if(!config[key])throw new CommerceError("INCOMPLETE_CAKE",`Choose a ${key} for your cake.`);
  const selected=(["occasion","size","flavour","filling","design"] as const).map(type=>options.find(option=>option.type===type&&option.name===config[type]&&option.active));
  if(selected.some(option=>!option))throw new CommerceError("INVALID_CAKE_OPTION","One of the selected cake options is unavailable.");
  const now=input.now??new Date();const requested=new Date(`${config.deliveryDate}T12:00:00`);const earliest=new Date(now.getTime()+(input.leadTimeHours??72)*60*60*1000);
  if(!config.deliveryDate||Number.isNaN(requested.getTime())||requested<earliest)throw new CommerceError("INVALID_CAKE_DATE","Choose a date with enough preparation time.");
  const estimatedTotal=selected.reduce((total,option)=>total+(option?.priceAdjustment??0),0);
  return {estimatedTotal,quoteRequired:selected.some(option=>option?.quoteRequired),earliestDate:earliest};
}
