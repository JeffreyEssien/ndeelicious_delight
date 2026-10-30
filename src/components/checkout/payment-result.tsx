"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { OrderPushButton } from "@/components/order/order-push-button";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart, useToast } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import type { StorefrontContent } from "@/types/content";

type PaymentState = {
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
  orderStatus?: string;
  orderNumber?: string;
  checkoutUrl?: string;
  expired?: boolean;
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
  const t = useCustomerText("payment result");

  const cart = useCart();
  const notify = useToast();
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
      if (!response.ok) throw new Error(payload.error ?? t("Payment status is unavailable."));
      setPayment(payload.payment);
      setError("");
      return payload.payment as PaymentState;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Payment status is unavailable."));
    }
  }, [sessionId, t]);

  useEffect(() => {
    let stopped = false;
    let terminal = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped || terminal || document.hidden) return;
      const result = await refresh();
      if (stopped) return;
      terminal = Boolean(result && (result.status !== "PENDING" || result.expired));
      if (!terminal) {
        timer = setTimeout(() => void poll(), delay);
        delay = Math.min(delay * 1.5, 30000);
      }
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (!document.hidden) void poll();
    }
    void poll();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [refresh]);

  useEffect(() => {
    if (payment?.status === "SUCCEEDED" && !cleared.current) {
      cleared.current = true;
      cart.clear();
      notify(t("Payment received. Thank you for your order!"));
    }
  }, [cart, notify, t, payment?.status]);

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
  const refunded = payment?.status === "REFUNDED" || payment?.status === "PARTIALLY_REFUNDED";
  const failed = payment?.status === "FAILED" || Boolean(payment?.expired);
  const pending = !payment || (payment.status === "PENDING" && !payment.expired);
  const headline = refunded
    ? t("Your payment has been refunded.")
    : succeeded
      ? content.headline
      : failed
        ? t("Your payment wasn’t completed.")
        : cancelled
          ? t("Your order is still awaiting payment.")
          : t("We’re confirming your payment.");
  const body = refunded
    ? t("Your order records have been updated. Contact the bakery if you have questions about your refund.")
    : succeeded
      ? content.body
      : failed
        ? t("No payment was confirmed. You can safely try again; stock and coupon availability will be checked first.")
        : cancelled
          ? t("Nothing has been charged. Resume the secure checkout whenever you’re ready.")
          : t(
              "This usually takes only a few seconds. You can leave this page; Stripe’s signed confirmation will update your order.",
            );

  return (
    <section className="success-page">
      <span className={`success-mark ${failed || cancelled ? "payment-attention" : ""}`}>
        <Icon name={succeeded ? "check" : "clock"} />
      </span>
      <span className="overline">{succeeded ? content.eyebrow : t("Payment status")}</span>
      <h1>{headline}</h1>
      <p>
        {payment?.orderNumber && (
          <>
            <b>
              {t("Order #")}
              {payment.orderNumber}
            </b>
            :{t(" ")}
          </>
        )}
        {body}
      </p>
      {succeeded && (
        <div className="next-steps">
          <h2>{t("What happens next?")}</h2>
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
        <p className="payment-polling" aria-live={"polite"}>
          {t("Checking for Stripe confirmation…")}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
      {succeeded && payment?.orderNumber && <OrderPushButton orderNumber={payment.orderNumber} sessionId={sessionId} />}
      <div className="success-actions">
        {succeeded && payment?.orderNumber && (
          <Link
            href={`/track-order?order=${encodeURIComponent(payment.orderNumber)}`}
            className="button button-primary"
          >
            {t("Track this order")}
          </Link>
        )}
        {(failed || (cancelled && !refunded)) && (
          <button type="button" className="button button-primary" disabled={retrying} onClick={retry}>
            {retrying ? t("Preparing payment…") : failed ? t("Try payment again") : t("Resume secure payment")}
          </button>
        )}
        <Link href={succeeded ? "/shop" : "/checkout"} className="button button-secondary">
          {succeeded ? t("Continue shopping") : t("Return to checkout")}
        </Link>
      </div>
    </section>
  );
}
