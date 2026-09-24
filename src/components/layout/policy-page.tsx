import type { StorefrontContent } from "@/types/content";

export function PolicyPage({ policy }: { policy: StorefrontContent["policies"][keyof StorefrontContent["policies"]] }) {
  return <><header className="page-hero small"><span className="overline">{policy.eyebrow} {policy.updated}</span><h1>{policy.title}</h1></header><article className="site-container policy-page">{policy.sections.map(section=><section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}</article></>;
}
