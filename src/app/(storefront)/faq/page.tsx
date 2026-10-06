import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import { ContentLines } from "@/components/ui/content-lines";
import { getStorefrontContent } from "@/lib/data/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("Frequently asked questions"), alternates: { canonical: "/faq" } };
}

export default async function Page() {
  const { faq } = await getStorefrontContent();
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{faq.hero.eyebrow}</span>
        <h1>
          <ContentLines text={faq.hero.headline} />
        </h1>
        <p>{faq.hero.supportingText}</p>
      </header>
      <section className="site-container faq-list">
        {faq.groups.map((group) => (
          <div key={group.title}>
            <h2>{group.title}</h2>
            <div>
              {group.questions.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <span>+</span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
