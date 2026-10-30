"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { useDeliveryZones } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import type { DeliveryArea } from "@/features/fulfilment/types";
import type { BusinessSettings } from "@/types/content";
import Link from "next/link";
import { useEffect, useState } from "react";

type Dates = { delivery: string | null; pickup: string | null };

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

function earliest(run: () => { date: string }) {
  try {
    return dayLabel(run().date);
  } catch {
    return null;
  }
}

// The earliest dates an order placed right now could arrive, from the same schedule and minimum
// lead time checkout uses. Worked out in the browser so the cached page never shows a stale day.
export function NextDelivery({ business }: { business: BusinessSettings }) {
  const t = useCustomerText("footer");
  const zones = useDeliveryZones();
  const [dates, setDates] = useState<Dates | null>(null);
  useEffect(() => {
    const schedule = business.fulfilmentSchedule ?? null;
    const area = zones.find((zone) => zone.active);
    setDates({
      delivery:
        business.deliveryEnabled && area
          ? earliest(() =>
              earliestFulfilment({ mode: "delivery", schedule, area: area as DeliveryArea, preparationHours: 0 }),
            )
          : null,
      pickup: business.pickupEnabled
        ? earliest(() => earliestFulfilment({ mode: "pickup", schedule, preparationHours: 0 }))
        : null,
    });
  }, [business, zones]);
  if (!dates || (!dates.delivery && !dates.pickup)) return null;
  return (
    <div className="next-delivery">
      <p className="next-delivery-title">
        <Icon name="clock" />
        {t("Order today")}
      </p>
      {dates.delivery && (
        <p>
          {t("Delivery from")} <b>{dates.delivery}</b>
        </p>
      )}
      {dates.pickup && (
        <p>
          {t("Pickup from")} <b>{dates.pickup}</b>
        </p>
      )}
      <Link href="/delivery-information">{t("Some items take longer. Checkout shows your exact date.")}</Link>
    </div>
  );
}
