"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, useDeliveryZones, useProducts } from "@/components/providers";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { Input, Textarea } from "@/components/ui/primitives";
import { resolveDeliveryArea } from "@/features/fulfilment/resolver";
import { resolveCheckoutFulfilment } from "@/features/fulfilment/checkout";
import { calculateOrderQuote } from "@/features/checkout/pricing";
import type { DeliveryArea } from "@/features/fulfilment/types";
import type { Fulfilment } from "@/types";
import type { BusinessSettings } from "@/types/content";
import { trackCommerceEvent } from "@/lib/analytics/client";
type Info = {
  name: string;
  email: string;
  phone: string;
  street: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

export function CheckoutFlow({ business }: { business: BusinessSettings }) {
  const t = useCustomerText("checkout flow");

  const cart = useCart();
  const products = useProducts();
  const deliveryZones = useDeliveryZones();
  const canDeliver = business.deliveryEnabled && deliveryZones.length > 0;
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<Info>({
    name: "",
    email: "",
    phone: "",
    street: "",
    addressLine2: "",
    city: "",
    province: "NS",
    postalCode: "",
    notes: "",
  });
  const [fulfilment, setFulfilment] = useState<Fulfilment>(canDeliver ? "delivery" : "pickup");
  let zone = "";
  let areaError = "";
  try {
    if (fulfilment === "delivery") zone = resolveDeliveryArea(info.postalCode, deliveryZones as DeliveryArea[]).area.id;
  } catch (reason) {
    areaError = reason instanceof Error ? reason.message : "Check your postal code.";
  }
  const [serverQuote, setServerQuote] = useState<{ taxTotal: number; grandTotal: number; deliveryFee: number } | null>(
    null,
  );
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Info | string, string>>>({});
  const [busy, setBusy] = useState(false);
  let delivery = 0;
  let tax = 0;
  let total = cart.subtotal;
  let earliestLabel = "";
  let fulfilmentError = "";
  let freeDeliveryRemaining: number | null = null;
  try {
    const preparationHours = Math.max(
      0,
      ...cart.lines.map((line) => products.find((product) => product.id === line.productId)?.preparationHours ?? 0),
    );
    const availability = resolveCheckoutFulfilment({
      delivery: { fulfilment, postalCode: info.postalCode, zoneId: zone || undefined },
      areas: deliveryZones as DeliveryArea[],
      subtotal: cart.subtotal,
      preparationHours,
      schedule: business.fulfilmentSchedule ?? null,
    });
    delivery = serverQuote?.deliveryFee ?? availability.fee;
    earliestLabel = availability.label;
    freeDeliveryRemaining = availability.freeDeliveryRemaining;
    const quote = calculateOrderQuote({
      cart: cart.lines,
      products,
      fulfilment,
      deliveryFee: delivery,
      taxEnabled: business.taxEnabled,
      deliveryTaxMode: business.deliveryTaxMode,
    });
    tax = serverQuote?.taxTotal ?? quote.taxTotal;
    total = serverQuote?.grandTotal ?? quote.grandTotal;
  } catch (reason) {
    fulfilmentError = reason instanceof Error ? reason.message : "Fulfilment setup is required.";
  }
  const money = (value: number) => formatMoney(value, business.currency, business.locale);
  useEffect(() => {
    if (cart.count > 0) trackCommerceEvent("CHECKOUT_STARTED");
  }, [cart.count]);
  useEffect(() => {
    if (!cart.lines.length) return;
    setServerQuote(null);
    setApplied(false);
    setDiscount(0);
  }, [cart.lines]);
  const resolved = useMemo(
    () =>
      cart.lines.flatMap((line) => {
        const p = products.find((item) => item.id === line.productId);
        const v = p?.variants.find((item) => item.id === line.variantId);
        return p && v ? [{ ...line, p, v }] : [];
      }),
    [cart.lines, products],
  );
  function set<K extends keyof Info>(key: K, value: Info[K]) {
    setInfo((v) => ({ ...v, [key]: value }));
    resetCoupon();
    setErrors((v) => ({ ...v, [key]: undefined }));
  }
  function resetCoupon() {
    setServerQuote(null);
    setApplied(false);
    setDiscount(0);
    setCouponError("");
  }
  function next(e?: FormEvent) {
    e?.preventDefault();
    if (step === 0) {
      const found: typeof errors = {};
      if (info.name.trim().length < 2) found.name = "Enter at least two characters for the name.";
      if (!/^\S+@\S+\.\S+$/.test(info.email)) found.email = "Enter a valid email address.";
      if (info.phone.replace(/\D/g, "").length < 10) found.phone = "Enter a valid phone number.";
      if (Object.keys(found).length) {
        setErrors(found);
        return;
      }
    }
    if (step === 1) {
      const found: typeof errors = {};
      if (fulfilment === "delivery") {
        if (!zone) found.postalCode = areaError;
        if (info.street.trim().length < 5) found.street = "Enter a complete delivery address.";
        if (info.city.trim().length < 2) found.city = "Enter a valid city.";

        if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(info.postalCode.trim()))
          found.postalCode = "Enter a valid Canadian postal code.";
      }
      const selectedZone = fulfilment === "delivery" ? deliveryZones.find((item) => item.id === zone) : undefined;
      if (fulfilmentError) found.fulfilment = fulfilmentError;
      const minimum = Math.max(business.orderMinimum, selectedZone?.minimumOrder ?? 0);
      if (cart.subtotal < minimum)
        found.fulfilment = t("Add {value1} more before continuing.", { value1: money(minimum - cart.subtotal) });
      if (Object.keys(found).length) {
        setErrors(found);
        return;
      }
    }
    setStep((v) => Math.min(2, v + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function applyCoupon() {
    setCouponBusy(true);
    setCouponError("");
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: info.name, email: info.email, phone: info.phone },
          delivery:
            fulfilment === "delivery"
              ? {
                  fulfilment,
                  zoneId: zone,
                  street: info.street,
                  addressLine2: info.addressLine2,
                  city: info.city,
                  province: info.province,
                  postalCode: info.postalCode,
                  country: "CA" as const,
                  notes: info.notes,
                }
              : { fulfilment },
          cart: resolved.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
          couponCode: coupon.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDiscount(payload.quote.discount);
      setServerQuote(payload.quote);
      setApplied(true);
      trackCommerceEvent("COUPON_APPLIED", { metadata: { discount: payload.quote.discount } });
    } catch (reason) {
      setServerQuote(null);
      setDiscount(0);
      setServerQuote(null);
      setApplied(false);
      setCouponError(reason instanceof Error ? reason.message : "That coupon is not valid.");
    } finally {
      setCouponBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setErrors((v) => ({ ...v, submit: undefined }));
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: { name: info.name, email: info.email, phone: info.phone },
          delivery:
            fulfilment === "delivery"
              ? {
                  fulfilment,
                  zoneId: zone,
                  street: info.street,
                  addressLine2: info.addressLine2,
                  city: info.city,
                  province: info.province,
                  postalCode: info.postalCode,
                  country: "CA" as const,
                  notes: info.notes,
                }
              : { fulfilment },
          cart: resolved.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
          couponCode: applied ? coupon.trim().toUpperCase() : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "We couldn’t validate this order.");
      const id = payload.order.number;
      localStorage.setItem(
        "ndee-last-order",
        JSON.stringify({
          id,
          name: info.name,
          email: info.email,
          total: payload.order.total,
          fulfilment,
          zone,
          items: cart.count,
        }),
      );
      if (!payload.payment?.checkoutUrl) throw new Error("Secure payment could not be started.");
      window.location.assign(payload.payment.checkoutUrl);
    } catch (reason) {
      setBusy(false);
      setErrors((v) => ({
        ...v,
        submit: reason instanceof Error ? reason.message : "We couldn’t validate this order.",
      }));
    }
  }
  if (!resolved.length)
    return (
      <div className="empty-state checkout-empty">
        <Icon name="bag" />
        <h2>{t("Your basket is empty")}</h2>
        <p>{t("Add a treat before starting checkout.")}</p>
        <Link href="/shop" className="button button-primary">
          {t("Browse the bakery")}
        </Link>
      </div>
    );
  if (!canDeliver && !business.pickupEnabled)
    return (
      <div className="empty-state checkout-empty">
        <Icon name="clock" />
        <h2>{t("Online ordering is paused")}</h2>
        <p>{t("Please check back later or contact the bakery for help with an order.")}</p>
        <Link href="/contact" className="button button-primary">
          {t("Contact the bakery")}
        </Link>
      </div>
    );
  return (
    <div className="checkout-grid">
      <section>
        <div className="checkout-progress">
          {["Information", "Fulfilment", "Review"].map((x, i) => (
            <div key={x} className={i === step ? "active" : i < step ? "done" : ""}>
              <span>{i < step ? <Icon name="check" /> : i + 1}</span>
              <b>{t(x)}</b>
            </div>
          ))}
        </div>
        {step === 0 && (
          <form className="checkout-panel" onSubmit={next}>
            <span className="overline">{t("Your details")}</span>
            <h1>{t("Who is this order for?")}</h1>
            <div className="form-stack">
              <Input
                label={t("Full name")}
                autoComplete="name"
                value={info.name}
                error={t(errors.name)}
                onChange={(e) => set("name", e.target.value)}
              />
              <Input
                label={t("Email address")}
                type="email"
                autoComplete="email"
                value={info.email}
                error={t(errors.email)}
                onChange={(e) => set("email", e.target.value)}
              />
              <Input
                label={t("Phone number")}
                type="tel"
                autoComplete="tel"
                value={info.phone}
                error={t(errors.phone)}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="0800 000 0000"
              />
            </div>
            <button className="button button-primary" type="submit">
              {t("Continue to fulfilment")}
              <Icon name="arrow" />
            </button>
          </form>
        )}
        {step === 1 && (
          <div className="checkout-panel">
            <span className="overline">{t("Fulfilment")}</span>
            <h1>{t("How should we get it to you?")}</h1>
            <p>
              Minimum preparation time: {Math.max(0, ...resolved.map((line) => line.p.preparationHours ?? 0))} hours.
              The bakery will confirm your collection or delivery window.
            </p>
            {business.deliveryEnabled && !deliveryZones.length && (
              <p>{t("Delivery is currently unavailable. You can collect your order from the bakery.")}</p>
            )}
            <div className="fulfilment-toggle">
              {canDeliver && (
                <button
                  type="button"
                  className={fulfilment === "delivery" ? "selected" : ""}
                  onClick={() => {
                    setFulfilment("delivery");
                    resetCoupon();
                  }}
                >
                  <Icon name="truck" />
                  <b>{t("Delivery")}</b>
                  <small>{t("To your Canadian delivery address")}</small>
                </button>
              )}
              {business.pickupEnabled && (
                <button
                  type="button"
                  className={fulfilment === "pickup" ? "selected" : ""}
                  onClick={() => {
                    setFulfilment("pickup");
                    resetCoupon();
                  }}
                >
                  <Icon name="bag" />
                  <b>{t("Pickup")}</b>
                  <small>{t("Collect from our bakery")}</small>
                </button>
              )}
            </div>
            {earliestLabel && <p>Earliest available: {earliestLabel}</p>}
            {freeDeliveryRemaining !== null && (
              <p>
                {freeDeliveryRemaining === 0
                  ? "Your order qualifies for free delivery."
                  : `Add ${money(freeDeliveryRemaining)} for free delivery.`}
              </p>
            )}
            {errors.fulfilment && (
              <p className="form-error" role="alert">
                {t(errors.fulfilment)}
              </p>
            )}
            {fulfilment === "delivery" ? (
              <div className="form-stack">
                <Input
                  label={t("Postal code")}
                  autoComplete="postal-code"
                  value={info.postalCode}
                  error={t(errors.postalCode)}
                  onChange={(e) => set("postalCode", e.target.value.toUpperCase())}
                  placeholder="B3H 2Y5"
                />
                <p role="status">
                  {zone ? deliveryZones.find((area) => area.id === zone)?.name : areaError} · Nova Scotia, Canada
                </p>
                <Input
                  label={t("Street address")}
                  autoComplete="street-address"
                  value={info.street}
                  error={t(errors.street)}
                  onChange={(e) => set("street", e.target.value)}
                />
                <Input
                  label={t("Apartment, suite or unit (optional)")}
                  autoComplete="address-line2"
                  value={info.addressLine2}
                  onChange={(e) => set("addressLine2", e.target.value)}
                />
                <div className="field-row">
                  <Input
                    label={t("City")}
                    value={info.city}
                    error={t(errors.city)}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
                <Textarea
                  label={t("Delivery notes (optional)")}
                  rows={3}
                  maxLength={500}
                  value={info.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder={t("Gate code, landmark or a helpful note")}
                />
              </div>
            ) : (
              <div className="pickup-card">
                <Icon name="bag" />
                <div>
                  <h3>{business.businessName}</h3>
                  <p>
                    {business.address || t("Pickup details")}{" "}
                    {t("and a collection time will be confirmed with your order.")}
                  </p>
                </div>
              </div>
            )}
            <div className="checkout-nav">
              <button type="button" className="button button-ghost" onClick={() => setStep(0)}>
                {t("Back")}
              </button>
              <button type="button" className="button button-primary" onClick={() => next()}>
                {t("Review order")}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="checkout-panel">
            <span className="overline">{t("Final check")}</span>
            <h1>{t("Review your order")}</h1>
            <div className="review-contact">
              <div>
                <span>{t("Contact")}</span>
                <p>
                  {info.name}
                  <br />
                  {info.email}
                  <br />
                  {info.phone}
                </p>
                <button type="button" onClick={() => setStep(0)}>
                  {t("Edit")}
                </button>
              </div>
              <div>
                <span>{fulfilment === "delivery" ? t("Deliver to") : t("Collection")}</span>
                <p>
                  {fulfilment === "delivery"
                    ? `${info.street}${info.addressLine2 ? `, ${info.addressLine2}` : ""}, ${info.city}, ${info.province} ${info.postalCode}`
                    : business.address || business.businessName}
                </p>
                <button type="button" onClick={() => setStep(1)}>
                  {t("Edit")}
                </button>
              </div>
            </div>
            <div className="coupon-box">
              <label htmlFor={"coupon"}>{t("Have a coupon?")}</label>
              <div>
                <input
                  id="coupon"
                  value={coupon}
                  disabled={applied}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder={t("Enter code")}
                />
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={couponBusy || applied || !coupon.trim()}
                  onClick={applyCoupon}
                >
                  {couponBusy ? t("Applying…") : applied ? t("Applied ✓") : "Apply"}
                </button>
              </div>
              {couponError && <small role="alert">{t(couponError)}</small>}
              {applied && (
                <small className="success-text">
                  {coupon.trim().toUpperCase()} {t("saved you ")}
                  {money(discount)}.
                </small>
              )}
            </div>
            <div className="payment-preview">
              <Icon name="check" />
              <div>
                <b>{t("Secure payment with Stripe")}</b>
                <p>
                  {t(
                    "You’ll continue to Stripe to pay. Your order is confirmed only after Stripe securely verifies the payment.",
                  )}
                </p>
              </div>
            </div>
            {errors.submit && (
              <p className="form-error" role="alert">
                {t(errors.submit)}
              </p>
            )}
            <div className="checkout-nav">
              <button type="button" className="button button-ghost" onClick={() => setStep(1)}>
                {t("Back")}
              </button>
              <button type="button" className="button button-primary" disabled={busy} onClick={finish}>
                {busy ? t("Opening secure payment…") : t("Continue to payment")}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        )}
      </section>
      <details className="checkout-summary">
        <summary>
          <span>{t("Order summary")}</span>
          <b>{money(total)}</b>
          <small>{t("Show")}</small>
        </summary>
        <div className="checkout-summary-content">
          <h2>{t("Order summary")}</h2>
          {resolved.map(({ p, v, quantity }) => (
            <div className="checkout-item" key={`${p.id}-${v.id}`}>
              {p.image ? (
                <Image
                  src={p.image}
                  alt=""
                  width={64}
                  height={72}
                  style={{ width: 64, height: 72, objectPosition: p.imagePosition }}
                />
              ) : (
                <span className="checkout-image-empty missing-image">{t("No image")}</span>
              )}
              <span>
                <b>{p.name}</b>
                <small>
                  {v.name} {t("· Qty ")}
                  {quantity}
                </small>
              </span>
              <strong>{money((p.price + v.priceAdjustment) * quantity)}</strong>
            </div>
          ))}
          <dl>
            <div>
              <dt>{t("Subtotal")}</dt>
              <dd>{money(cart.subtotal)}</dd>
            </div>
            <div>
              <dt>{fulfilment === "pickup" ? t("Pickup") : t("Delivery")}</dt>
              <dd>{fulfilment === "pickup" ? t("Free") : delivery ? money(delivery) : "—"}</dd>
            </div>
            {applied && (
              <div className="discount-row">
                <dt>{t("Discount")}</dt>
                <dd>−{money(discount)}</dd>
              </div>
            )}
            {business.taxEnabled && (
              <div>
                <dt>{business.taxLabel}</dt>
                <dd>{money(tax)}</dd>
              </div>
            )}
            <div className="total-row">
              <dt>{t("Total")}</dt>
              <dd>{money(total)}</dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}
