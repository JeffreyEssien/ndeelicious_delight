import { ContentLines } from "@/components/ui/content-lines";
import { getDeliveryZones } from "@/lib/data/catalog";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";
import { formatMoney } from "@/lib/format";

export default async function Page() {
  const [deliveryZones, content, business] = await Promise.all([
    getDeliveryZones(),
    getStorefrontContent(),
    getBusinessSettings(),
  ]);
  const page = content.delivery;
  return (
    <>
      <header className="page-hero">
        <span className="overline">{page.hero.eyebrow}</span>
        <h1>
          <ContentLines text={page.hero.headline} />
        </h1>
        <p>{page.hero.supportingText}</p>
      </header>
      <section className="site-container delivery-page">
        <div className="delivery-zones">
          <div>
            <span className="overline">{page.intro.eyebrow}</span>
            <h2>{page.intro.headline}</h2>
            <p>{page.intro.body}</p>
          </div>
          <div>
            {business.deliveryEnabled && deliveryZones.length ? (
              deliveryZones.map((zone) => (
                <div key={zone.id}>
                  <span>
                    <b>{zone.name}</b>
                    <small>
                      {zone.estimate}
                      {zone.minimumOrder > 0 ? ` · ${formatMoney(zone.minimumOrder)} minimum` : ""}
                    </small>
                  </span>
                  <strong>{formatMoney(zone.fee)}</strong>
                </div>
              ))
            ) : (
              <p>
                {business.deliveryEnabled
                  ? "No delivery zones are currently active."
                  : "Delivery ordering is currently paused."}
                {business.pickupEnabled ? " Pickup remains available." : ""}
              </p>
            )}
          </div>
        </div>
        <div className="delivery-notes">
          {page.steps.map((step, index) => (
            <article key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body.replace("current bakery setting", `${business.cakeLeadHours}-hour minimum`)}</p>
            </article>
          ))}
        </div>
        {business.pickupEnabled && <div className="pickup-callout">
          <div>
            <span className="overline">{page.pickup.eyebrow}</span>
            <h2>{page.pickup.headline}</h2>
            <p>{page.pickup.body}</p>
          </div>
          {(business.openingHours || business.address) && (
            <span>
              {business.openingHours}
              <br />
              <b>{business.address}</b>
            </span>
          )}
        </div>}
      </section>
    </>
  );
}
