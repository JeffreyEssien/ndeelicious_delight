"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { type FormEvent, useState } from "react";
import { Input } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { useBusinessSettings } from "@/components/providers";

const stages = ["Order confirmed", "Preparing", "Ready", "Out for delivery", "Delivered"];
const statusStep: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PAID: 0,
  CONFIRMED: 0,
  PREPARING: 1,
  READY: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
};
type TrackedOrder = { order_number: string; status: string; fulfilment: string; updated_at: string };

export function TrackOrder({ initial = "" }: { initial?: string }) {
  const t = useCustomerText("track order");

  const business = useBusinessSettings();
  const [id, setId] = useState(initial);
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/orders/track?order=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setOrder(payload.order);
    } catch (reason) {
      setOrder(null);
      setError(reason instanceof Error ? reason.message : "We couldn’t find that order.");
    } finally {
      setBusy(false);
    }
  }
  if (!order)
    return (
      <form className="track-form" onSubmit={submit}>
        <Input
          label={t("Order number")}
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder={t("ND-12345678")}
        />
        <Input label={t("Email address")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? t("Looking…") : t("Find my order")} <Icon name="arrow" />
        </button>
      </form>
    );
  const current = statusStep[order.status] ?? 0;
  return (
    <div className="tracking-result">
      <div className="tracking-head">
        <span className="success-mark">
          <Icon name="check" />
        </span>
        <div>
          <span className="overline">
            {t("Order ")}
            {order.order_number}
          </span>
          <h2>
            {order.status === "PENDING_PAYMENT"
              ? t("Your order is awaiting payment.")
              : t("Your order is {value1}.", { value1: t(order.status.toLowerCase().replaceAll("_", " ")) })}
          </h2>
          <p>
            {order.fulfilment === "pickup" ? t("Pickup") : t("Delivery")}{" "}
            {t("details will be confirmed by the bakery.")}
          </p>
        </div>
      </div>
      <div className="tracking-steps">
        {stages.map((stage, index) => (
          <div className={index < current ? "done" : index === current ? "current" : ""} key={stage}>
            <span>{index < current ? <Icon name="check" /> : index + 1}</span>
            <div>
              <b>{t(stage)}</b>
              {index === current && (
                <small>
                  {t("Updated")}
                  {new Date(order.updated_at).toLocaleString(business.locale, { timeZone: business.timezone })}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="text-button" onClick={() => setOrder(null)}>
        {t("Track a different order")}
      </button>
    </div>
  );
}
