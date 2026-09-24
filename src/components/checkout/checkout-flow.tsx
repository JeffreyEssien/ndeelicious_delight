"use client";
import { type FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart, useDeliveryZones, useProducts } from "@/components/providers";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { Input, Select, Textarea } from "@/components/ui/primitives";
import type { Fulfilment } from "@/types";
import type { BusinessSettings } from "@/types/content";
type Info = { name: string; email: string; phone: string; street: string; area: string; city: string; notes: string };
const blank: Info = { name: "", email: "", phone: "", street: "", area: "", city: "Lagos", notes: "" };
export function CheckoutFlow({ business }: { business: BusinessSettings }) {
  const cart = useCart();
  const products = useProducts();
  const deliveryZones = useDeliveryZones();
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState(blank);
  const [fulfilment, setFulfilment] = useState<Fulfilment>(business.deliveryEnabled ? "delivery" : "pickup");
  const [zone, setZone] = useState("");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Info | string, string>>>({});
  const [busy, setBusy] = useState(false);
  const delivery = fulfilment === "delivery" ? (deliveryZones.find((z) => z.id === zone)?.fee ?? 0) : 0;
  const total = cart.subtotal + delivery - discount;
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
      }
      const selectedZone = fulfilment === "delivery" ? deliveryZones.find((item) => item.id === zone) : undefined;
      const minimum = Math.max(business.orderMinimum, selectedZone?.minimumOrder ?? 0);
      if (cart.subtotal < minimum)
        found.fulfilment = `Add ${formatMoney(minimum - cart.subtotal)} more before continuing.`;
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
              ? { fulfilment, zoneId: zone, street: info.street, area: info.area, city: info.city, notes: info.notes }
              : { fulfilment },
          cart: resolved.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
          couponCode: coupon.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDiscount(payload.quote.discount);
      setApplied(true);
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
              ? { fulfilment, zoneId: zone, street: info.street, area: info.area, city: info.city, notes: info.notes }
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
        <h2>Your basket is empty</h2>
        <p>Add a treat before starting checkout.</p>
        <Link href="/shop" className="button button-primary">
          Browse the bakery
        </Link>
      </div>
    );
  if (!business.deliveryEnabled && !business.pickupEnabled)
    return (
      <div className="empty-state checkout-empty">
        <Icon name="clock" />
        <h2>Online ordering is paused</h2>
        <p>Please check back later or contact the bakery for help with an order.</p>
        <Link href="/contact" className="button button-primary">
          Contact the bakery
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
              <b>{x}</b>
            </div>
          ))}
        </div>
        {step === 0 && (
          <form className="checkout-panel" onSubmit={next}>
            <span className="overline">Your details</span>
            <h1>Who is this order for?</h1>
            <div className="form-stack">
              <Input
                label="Full name"
                autoComplete="name"
                value={info.name}
                error={errors.name}
                onChange={(e) => set("name", e.target.value)}
              />
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                value={info.email}
                error={errors.email}
                onChange={(e) => set("email", e.target.value)}
              />
              <Input
                label="Phone number"
                type="tel"
                autoComplete="tel"
                value={info.phone}
                error={errors.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="0800 000 0000"
              />
            </div>
            <button className="button button-primary" type="submit">
              Continue to fulfilment <Icon name="arrow" />
            </button>
          </form>
        )}
        {step === 1 && (
          <div className="checkout-panel">
            <span className="overline">Fulfilment</span>
            <h1>How should we get it to you?</h1>
            <div className="fulfilment-toggle">
              {business.deliveryEnabled && (
                <button
                  type="button"
                  className={fulfilment === "delivery" ? "selected" : ""}
                  onClick={() => {
                    setFulfilment("delivery");
                    resetCoupon();
                  }}
                >
                  <Icon name="truck" />
                  <b>Delivery</b>
                  <small>To your Lagos address</small>
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
                  <b>Pickup</b>
                  <small>Collect from our bakery</small>
                </button>
              )}
            </div>
            {errors.fulfilment && (
              <p className="form-error" role="alert">
                {errors.fulfilment}
              </p>
            )}
            {fulfilment === "delivery" ? (
              <div className="form-stack">
                <Select
                  label="Delivery area"
                  value={zone}
                  error={errors.zone}
                  onChange={(e) => {
                    setZone(e.target.value);
                    resetCoupon();
                    setErrors((v) => ({ ...v, zone: undefined }));
                  }}
                >
                  <option value="">Choose your area</option>
                  {deliveryZones.map((z) => (
                    <option value={z.id} key={z.id}>
                      {z.name} · {formatMoney(z.fee)}
                      {z.minimumOrder > 0 ? ` · ${formatMoney(z.minimumOrder)} minimum` : ""}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Street address"
                  autoComplete="street-address"
                  value={info.street}
                  error={errors.street}
                  onChange={(e) => set("street", e.target.value)}
                />
                <div className="field-row">
                  <Input label="Area" value={info.area} onChange={(e) => set("area", e.target.value)} />
                  <Input
                    label="City"
                    value={info.city}
                    error={errors.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
                <Textarea
                  label="Delivery notes (optional)"
                  rows={3}
                  maxLength={500}
                  value={info.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Gate code, landmark or a helpful note"
                />
              </div>
            ) : (
              <div className="pickup-card">
                <Icon name="bag" />
                <div>
                  <h3>{business.businessName}</h3>
                  <p>{business.address || "Pickup details"} and a collection time will be confirmed with your order.</p>
                </div>
              </div>
            )}
            <div className="checkout-nav">
              <button type="button" className="button button-ghost" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="button" className="button button-primary" onClick={() => next()}>
                Review order <Icon name="arrow" />
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="checkout-panel">
            <span className="overline">Final check</span>
            <h1>Review your order</h1>
            <div className="review-contact">
              <div>
                <span>Contact</span>
                <p>
                  {info.name}
                  <br />
                  {info.email}
                  <br />
                  {info.phone}
                </p>
                <button type="button" onClick={() => setStep(0)}>
                  Edit
                </button>
              </div>
              <div>
                <span>{fulfilment === "delivery" ? "Deliver to" : "Collection"}</span>
                <p>
                  {fulfilment === "delivery"
                    ? `${info.street}, ${deliveryZones.find((z) => z.id === zone)?.name}, Lagos`
                    : business.address || business.businessName}
                </p>
                <button type="button" onClick={() => setStep(1)}>
                  Edit
                </button>
              </div>
            </div>
            <div className="coupon-box">
              <label htmlFor="coupon">Have a coupon?</label>
              <div>
                <input
                  id="coupon"
                  value={coupon}
                  disabled={applied}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder="Enter code"
                />
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={couponBusy || applied || !coupon.trim()}
                  onClick={applyCoupon}
                >
                  {couponBusy ? "Applying…" : applied ? "Applied ✓" : "Apply"}
                </button>
              </div>
              {couponError && <small role="alert">{couponError}</small>}
              {applied && (
                <small className="success-text">
                  {coupon.trim().toUpperCase()} saved you {formatMoney(discount)}.
                </small>
              )}
            </div>
            <div className="payment-preview">
              <Icon name="check" />
              <div>
                <b>Secure payment with Stripe</b>
                <p>
                  You’ll continue to Stripe to pay. Your order is confirmed only after Stripe securely verifies the
                  payment.
                </p>
              </div>
            </div>
            {errors.submit && (
              <p className="form-error" role="alert">
                {errors.submit}
              </p>
            )}
            <div className="checkout-nav">
              <button type="button" className="button button-ghost" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="button button-primary" disabled={busy} onClick={finish}>
                {busy ? "Opening secure payment…" : "Continue to payment"}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        )}
      </section>
      <aside className="checkout-summary">
        <h2>Order summary</h2>
        {resolved.map(({ p, v, quantity }) => (
          <div className="checkout-item" key={`${p.id}-${v.id}`}>
            {p.image ? (
              <Image src={p.image} alt="" width={64} height={72} style={{ objectPosition: p.imagePosition }} />
            ) : (
              <span className="checkout-image-empty missing-image">No image</span>
            )}
            <span>
              <b>{p.name}</b>
              <small>
                {v.name} · Qty {quantity}
              </small>
            </span>
            <strong>{formatMoney((p.price + v.priceAdjustment) * quantity)}</strong>
          </div>
        ))}
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(cart.subtotal)}</dd>
          </div>
          <div>
            <dt>{fulfilment === "pickup" ? "Pickup" : "Delivery"}</dt>
            <dd>{fulfilment === "pickup" ? "Free" : delivery ? formatMoney(delivery) : "—"}</dd>
          </div>
          {applied && (
            <div className="discount-row">
              <dt>Discount</dt>
              <dd>−{formatMoney(discount)}</dd>
            </div>
          )}
          <div className="total-row">
            <dt>Total</dt>
            <dd>{formatMoney(total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
