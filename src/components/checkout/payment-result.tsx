"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import type { StorefrontContent } from "@/types/content";

type PaymentState = {
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  orderStatus?: string;
  orderNumber?: string;
  checkoutUrl?: string;
};

export function PaymentResult({
  sessionId,
  cancelled,
  content,
}: {
  sessionId: string;
  cancelled: boolean;
  content: StorefrontContent["orderSuccess"];
}) {
  const cart = useCart();
  const cleared = useRef(false);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/payments/status?session=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Payment status is unavailable.");
      setPayment(payload.payment);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment status is unavailable.");
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (payment?.status === "SUCCEEDED" && !cleared.current) {
      cleared.current = true;
      cart.clear();
    }
  }, [cart, payment?.status]);

  async function retry() {
    setRetrying(true);
    setError("");
    try {
      const response = await fetch("/api/payments/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Payment could not be restarted.");
      window.location.assign(payload.payment.checkoutUrl);
    } catch (reason) {
      setRetrying(false);
      setError(reason instanceof Error ? reason.message : "Payment could not be restarted.");
    }
  }

  const succeeded = payment?.status === "SUCCEEDED";
  const failed = payment?.status === "FAILED";
  const pending = !payment || payment.status === "PENDING";
  const headline = succeeded
    ? content.headline
    : failed
      ? "Your payment wasn’t completed."
      : cancelled
        ? "Your order is still awaiting payment."
        : "We’re confirming your payment.";
  const body = succeeded
    ? content.body
    : failed
      ? "No payment was confirmed. You can safely try again; stock and coupon availability will be checked first."
      : cancelled
        ? "Nothing has been charged. Resume the secure checkout whenever you’re ready."
        : "This usually takes only a few seconds. You can leave this page; Stripe’s signed confirmation will update your order.";

  return (
    <section className="success-page">
      <span className={`success-mark ${failed || cancelled ? "payment-attention" : ""}`}>
        <Icon name={succeeded ? "check" : "clock"} />
      </span>
      <span className="overline">{succeeded ? content.eyebrow : "Payment status"}</span>
      <h1>{headline}</h1>
      <p>
        {payment?.orderNumber && (
          <>
            <b>Order #{payment.orderNumber}</b>:{" "}
          </>
        )}
        {body}
      </p>
      {succeeded && (
        <div className="next-steps">
          <h2>What happens next?</h2>
          {content.steps.map((step, index) => (
            <div key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>
                <b>{step.title}</b>
                <small>{step.body}</small>
              </p>
            </div>
          ))}
        </div>
      )}
      {pending && !cancelled && (
        <p className="payment-polling" aria-live="polite">
          Checking for Stripe confirmation…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="success-actions">
        {succeeded && payment?.orderNumber && (
          <Link
            href={`/track-order?order=${encodeURIComponent(payment.orderNumber)}`}
            className="button button-primary"
          >
            Track this order
          </Link>
        )}
        {(failed || cancelled) && (
          <button type="button" className="button button-primary" disabled={retrying} onClick={retry}>
            {retrying ? "Preparing payment…" : failed ? "Try payment again" : "Resume secure payment"}
          </button>
        )}
        <Link href={succeeded ? "/shop" : "/checkout"} className="button button-secondary">
          {succeeded ? "Continue shopping" : "Return to checkout"}
        </Link>
      </div>
    </section>
  );
}
