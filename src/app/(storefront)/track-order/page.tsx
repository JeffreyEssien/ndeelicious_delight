import { TrackOrder } from "@/components/order/track-order";
import { ContentLines } from "@/components/ui/content-lines";
import { getStorefrontContent } from "@/lib/data/settings";
export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [params, content] = await Promise.all([searchParams, getStorefrontContent()]);
  const order = params.order ?? "";
  const header = content.headers.track;
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{header.eyebrow}</span>
        <h1>
          <ContentLines text={header.headline} />
        </h1>
        <p>{header.supportingText}</p>
      </header>
      <section className="site-container track-page">
        <TrackOrder initial={order} />
      </section>
    </>
  );
}
