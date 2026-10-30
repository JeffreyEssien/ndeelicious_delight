"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { Icon } from "@/components/ui/icons";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import { whatsappUrl } from "@/lib/contact";
import type { BusinessSettings } from "@/types/content";
import Link from "next/link";
import { useEffect, useState } from "react";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function time(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, hour, minute)),
  );
}

// "Mon–Sat" for a run of days, "Mon, Wed, Fri" otherwise; the week is read Monday first.
function dayRange(days: number[]) {
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((day) => days.includes(day));
  if (ordered.length === 7) return "Every day";
  const runs: number[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] + 1) % 7 === day) last.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) =>
      run.length > 2
        ? `${dayNames[run[0]]}–${dayNames[run[run.length - 1]]}`
        : run.map((day) => dayNames[day]).join(", "),
    )
    .join(", ");
}

export function FindUs({ business }: { business: BusinessSettings }) {
  const t = useCustomerText("Page: (storefront)");
  const schedule = business.fulfilmentSchedule;
  const pickup = Boolean(business.pickupEnabled && schedule?.pickupEnabled);
  const address =
    (pickup && schedule?.pickupAddress) ||
    [business.address, business.city, business.province].filter(Boolean).join(", ");
  const hours =
    business.openingHours ||
    (pickup && schedule
      ? `${dayRange(schedule.pickupDays)} · ${time(schedule.pickupHours.start)}–${time(schedule.pickupHours.end)}`
      : "");
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const whatsapp = whatsappUrl(business.whatsapp);
  // Worked out in the browser so a cached page never shows yesterday's slot.
  const [nextPickup, setNextPickup] = useState<string | null>(null);
  useEffect(() => {
    if (!pickup || !schedule) return;
    try {
      const { earliestAt } = earliestFulfilment({ mode: "pickup", schedule, preparationHours: 0 });
      setNextPickup(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Halifax",
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(earliestAt)),
      );
    } catch {
      setNextPickup(null);
    }
  }, [pickup, schedule]);
  if (!address) return null;
  const steps = pickup
    ? [
        [t("Order online"), t("Pick your pies, rolls or cake and choose pickup at checkout.")],
        [t("We bake it fresh"), t("Your order is made for you. We’ll email when it’s ready.")],
        [t("Collect and enjoy"), t("Pop by during pickup hours. No delivery fee.")],
      ]
    : [];
  return (
    <section className="section site-container find-us">
      <div className="find-us-panel">
        <div className="find-us-copy">
          <span className="overline">{pickup ? t("Free pickup in Halifax") : t("Visit us")}</span>
          <h2>{pickup ? t("Order online. Collect it fresh.") : t("Find us in Halifax")}</h2>
          <p>
            {pickup
              ? t("Skip the delivery fee and pick up straight from our kitchen. It takes three easy steps.")
              : t("Come say hello and see what’s fresh today.")}
          </p>
          {!!steps.length && (
            <ol className="find-us-steps">
              {steps.map(([title, body], index) => (
                <li key={title}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="find-us-actions">
            <Link className="button button-primary" href="/shop">
              {pickup ? t("Order for pickup") : t("Shop now")} <Icon name="arrow" />
            </Link>
            <a className="button button-secondary" href={directions} target="_blank" rel="noreferrer">
              {t("Get directions")} ↗
            </a>
          </div>
          {(whatsapp || business.phone) && (
            <p className="find-us-help">
              {t("Questions before you come?")}{" "}
              {whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  {t("Message us on WhatsApp")}
                </a>
              ) : (
                <a href={`tel:${business.phone.replace(/[^0-9+]/g, "")}`}>
                  {t("Call {phone}", { phone: business.phone })}
                </a>
              )}
            </p>
          )}
        </div>
        <a
          className="find-us-map"
          href={directions}
          target="_blank"
          rel="noreferrer"
          aria-label={t("Open {address} in Google Maps", { address })}
        >
          <span className="find-us-roads" aria-hidden="true" />
          <span className="find-us-pin" aria-hidden="true">
            <span />
          </span>
          <span className="find-us-place">
            <b>{business.businessName}</b>
            <span>{address}</span>
            {hours && (
              <small>
                <Icon name="clock" /> {hours}
              </small>
            )}
            {nextPickup && (
              <em>
                {t("Next pickup")} · {nextPickup}
              </em>
            )}
          </span>
        </a>
      </div>
    </section>
  );
}
