import { Catalogue } from "@/components/product/catalogue";
import { ContentLines } from "@/components/ui/content-lines";
import { getStorefrontContent } from "@/lib/data/settings";
export default async function Page(){const {headers}=await getStorefrontContent();const header=headers.pastries;return <><header className="page-hero small"><span className="overline">{header.eyebrow}</span><h1><ContentLines text={header.headline}/></h1><p>{header.supportingText}</p></header><section className="site-container catalogue-section"><Catalogue initialCategory="PASTRIES"/></section></>}
