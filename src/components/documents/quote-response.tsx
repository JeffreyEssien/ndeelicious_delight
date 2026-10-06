"use client";
import { useCustomerText } from "@/components/customer-text-provider";

import { type FormEvent, useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui/primitives";

export function QuoteResponse({
  token,
  initialState,
  contactEmail,
  quoteNumber,
  zones,
  deliveryEnabled,
  pickupEnabled,
  currency,
  locale,
}: {
  token: string;
  initialState: string;
  contactEmail: string;
  quoteNumber: string;
  zones: Array<{ id: string; name: string; fee: number; minimumOrder: number }>;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  currency: string;
  locale: string;
}) {
  const t = useCustomerText("quote response");

  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canDeliver = deliveryEnabled && zones.length > 0;
  const defaultFulfilment = pickupEnabled ? "pickup" : "delivery";
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">(defaultFulfilment);
  const [payment, setPayment] = useState<{ checkoutUrl: string; total: number } | null>(null);
  const askUrl = `mailto:${contactEmail}?subject=${encodeURIComponent(t("Question about quote {value1}", { value1: quoteNumber }))}`;

  async function respond(response: "ACCEPTED" | "DECLINED") {
    if (busy) return;
    if (response === "DECLINED" && !window.confirm("Decline this quote? You can still ask us for an update later."))
      return;
    setBusy(true);
    setError("");
    const result = await fetch("/api/documents/quotes/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, response }),
    });
    const payload = await result.json().catch(() => null);
    setBusy(false);
    if (!result.ok) {
      setError(payload?.error ?? "We could not save your response. Please try again.");
      return;
    }
    setState(payload.state);
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const delivery =
      fulfilment === "pickup"
        ? { fulfilment }
        : {
            fulfilment,
            zoneId: String(form.get("zoneId") ?? ""),
            street: String(form.get("street") ?? ""),
            addressLine2: String(form.get("addressLine2") ?? ""),
            city: String(form.get("city") ?? ""),
            province: String(form.get("province") ?? ""),
            postalCode: String(form.get("postalCode") ?? ""),
            notes: String(form.get("notes") ?? ""),
          };
    const result = await fetch("/api/documents/quotes/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, delivery }),
    });
    const payload = await result.json().catch(() => null);
    setBusy(false);
    if (!result.ok || !payload?.checkoutUrl) {
      setError(payload?.error ?? "Payment could not be started. Please try again.");
      return;
    }
    setPayment({ checkoutUrl: payload.checkoutUrl, total: payload.total });
  }

  if (state === "EXPIRED")
    return (
      <section className="quote-response" aria-labelledby={"quote-response-title"}>
        <h2 id="quote-response-title">{t("This quote has expired")}</h2>
        <p>{t("Ask us for an updated quote and we’ll confirm current pricing and availability.")}</p>
        <a className="button button-primary" href={askUrl}>
          {t("Ask for an updated quote")}
        </a>
      </section>
    );
  if (state === "DECLINED")
    return (
      <section className="quote-response" aria-live={"polite"}>
        <h2>{t("Quote declined")}</h2>
        <p>{t("Your response is saved. You can ask us for a revised quote at any time.")}</p>
        <a className="button button-secondary" href={askUrl}>
          {t("Ask a question")}
        </a>
      </section>
    );
  if (state === "ACCEPTED")
    if (payment)
      return (
        <section className="quote-response" aria-labelledby={"quote-total-title"}>
          <h2 id="quote-total-title">{t("Final payable amount")}</h2>
          <p>{t("This includes the accepted cake quote, selected delivery, and applicable tax.")}</p>
          <strong className="quote-final-total">
            {new Intl.NumberFormat(locale, { style: "currency", currency }).format(payment.total / 100)}
          </strong>
          <a className="button button-primary" href={payment.checkoutUrl}>
            {t("Continue to secure payment")}
          </a>
        </section>
      );
  if (state === "ACCEPTED")
    return (
      <section className="quote-response" aria-labelledby={"quote-checkout-title"}>
        <h2 id="quote-checkout-title">{t("Choose fulfilment")}</h2>
        <p>
          {t(
            "Your cake and contact details are already filled in. Add only what we still need to calculate the final total.",
          )}
        </p>
        <form className="form-stack" onSubmit={checkout}>
          <Select
            label={t("Receive my order by")}
            value={fulfilment}
            onChange={(event) => setFulfilment(event.target.value as "pickup" | "delivery")}
          >
            {pickupEnabled && <option value="pickup">{t("Bakery pickup")}</option>}
            {canDeliver && <option value="delivery">{t("Delivery")}</option>}
          </Select>
          {deliveryEnabled && !zones.length && (
            <p>{t("Delivery is currently unavailable. Choose pickup or contact us to arrange fulfilment.")}</p>
          )}
          {fulfilment === "delivery" && canDeliver && (
            <>
              <Select name="zoneId" label={t("Delivery area")} required defaultValue="">
                <option value="" disabled>
                  {t("Choose an area")}
                </option>
                {zones.map((zone) => (
                  <option value={zone.id} key={zone.id}>
                    {zone.name} —{t(" ")}
                    {new Intl.NumberFormat(locale, { style: "currency", currency }).format(zone.fee / 100)}{" "}
                    {t("delivery")}
                  </option>
                ))}
              </Select>
              <Input name="street" label={t("Street address")} required />
              <Input name="addressLine2" label={t("Apartment or unit (optional)")} />
              <div className="document-number-row">
                <Input name="city" label={t("City")} required />
                <Input name="province" label={t("Province code")} maxLength={2} required />
              </div>
              <Input name="postalCode" label={t("Postal code")} required />
              <Textarea name="notes" label={t("Delivery instructions (optional)")} rows={3} />
            </>
          )}
          <Button
            type="submit"
            disabled={busy || (fulfilment === "delivery" && !canDeliver) || (!pickupEnabled && !canDeliver)}
          >
            {busy ? t("Preparing secure payment…") : t("Review total & pay securely")}
          </Button>
          {error && <p className="field-error">{t(error)}</p>}
        </form>
      </section>
    );
  return (
    <section className="quote-response" aria-labelledby={"quote-response-title"}>
      <h2 id="quote-response-title">{t("Ready to continue?")}</h2>
      <p>{t("Accept the quote to confirm that you’d like to move ahead with this cake.")}</p>
      <div className="quote-response-actions">
        <Button disabled={busy} onClick={() => respond("ACCEPTED")}>
          {busy ? t("Saving…") : t("Accept & continue")}
        </Button>
        <a className="button button-secondary" href={askUrl}>
          {t("Ask a question")}
        </a>
        <button className="text-button" type="button" disabled={busy} onClick={() => respond("DECLINED")}>
          {t("Decline")}
        </button>
      </div>
      {error && <p className="field-error">{t(error)}</p>}
    </section>
  );
}
