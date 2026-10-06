"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, useDeliveryZones, useProducts } from "@/components/providers";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { Input, Select, Textarea } from "@/components/ui/primitives";
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
const provinces = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
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
    province: business.province,
    postalCode: "",
    notes: "",
  });
  const [fulfilment, setFulfilment] = useState<Fulfilment>(canDeliver ? "delivery" : "pickup");
  const [zone, setZone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Info | string, string>>>({});
  const [busy, setBusy] = useState(false);
  const delivery = fulfilment === "delivery" ? (deliveryZones.find((z) => z.id === zone)?.fee ?? 0) : 0;
  const tax = business.taxEnabled
    ? Math.round(((cart.subtotal - discount + (business.taxDelivery ? delivery : 0)) * business.taxRateBps) / 10_000)
    : 0;
  const total = cart.subtotal + delivery - discount + tax;
  const money = (value: number) => formatMoney(value, business.currency, business.locale);
  useEffect(() => {
    if (cart.count > 0) trackCommerceEvent("CHECKOUT_STARTED");
  }, [cart.count]);
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
    setErrors((v) => ({ ...v, [key]: undefined }));
  }
  function resetCoupon() {
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
        if (!zone) found.zone = "Choose a delivery area.";
        if (info.street.trim().length < 5) found.street = "Enter a complete delivery address.";
        if (info.city.trim().length < 2) found.city = "Enter a valid city.";
        if (!provinces.includes(info.province)) found.province = "Choose a province or territory.";
        if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(info.postalCode.trim()))
          found.postalCode = "Enter a valid Canadian postal code.";
      }
      const selectedZone = fulfilment === "delivery" ? deliveryZones.find((item) => item.id === zone) : undefined;
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
      setApplied(true);
      trackCommerceEvent("COUPON_APPLIED", { metadata: { discount: payload.quote.discount } });
    } catch (reason) {
      setDiscount(0);
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
            {errors.fulfilment && (
              <p className="form-error" role="alert">
                {t(errors.fulfilment)}
              </p>
            )}
            {fulfilment === "delivery" ? (
              <div className="form-stack">
                <Select
                  label={t("Delivery area")}
                  value={zone}
                  error={t(errors.zone)}
                  onChange={(e) => {
                    setZone(e.target.value);
                    resetCoupon();
                    setErrors((v) => ({ ...v, zone: undefined }));
                  }}
                >
                  <option value="">{t("Choose your area")}</option>
                  {deliveryZones.map((z) => (
                    <option value={z.id} key={z.id}>
                      {z.name} · {money(z.fee)}
                      {z.minimumOrder > 0 ? t(" · {value1} minimum", { value1: money(z.minimumOrder) }) : ""}
                    </option>
                  ))}
                </Select>
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
                  <Select
                    label={t("Province or territory")}
                    value={info.province}
                    error={t(errors.province)}
                    onChange={(e) => set("province", e.target.value)}
                  >
                    <option value="">{t("Choose one")}</option>
                    {provinces.map((province) => (
                      <option key={province}>{province}</option>
                    ))}
                  </Select>
                </div>
                <Input
                  label={t("Postal code")}
                  autoComplete="postal-code"
                  value={info.postalCode}
                  error={t(errors.postalCode)}
                  onChange={(e) => set("postalCode", e.target.value.toUpperCase())}
                  placeholder={t("A1A 1A1")}
                />
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
