"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// The Checkout Studio appearance for the embedded payment form.
const appearance = {
  theme: "stripe",
  labels: "auto",
  inputs: "spaced",
  variables: {
    borderRadius: "4px",
    colorBackground: "#ffffff",
    colorDanger: "#df1b41",
    colorPrimary: "#0570de",
    colorSuccess: "#00c853",
    colorText: "#30313d",
    fontFamily: "default",
    fontSizeBase: "16px",
    spacingUnit: "4px",
  },
};

type ConfirmEvent = unknown;
type CheckoutForm = {
  mount: (selector: string) => void;
  on: (name: "confirm", handler: (event: ConfirmEvent) => void) => void;
};
type CheckoutFormSdk = {
  createForm: (options: { layout: "expanded" }) => CheckoutForm;
  loadActions: () => Promise<
    | { type: "success"; actions: { confirm: (options: { formConfirmEvent: ConfirmEvent }) => Promise<unknown> } }
    | { type: "error"; error: { message?: string } }
  >;
};
type StripeJs = {
  initCheckoutFormSdk: (options: {
    clientSecret: Promise<string> | string;
    appearance: typeof appearance;
  }) => CheckoutFormSdk;
};
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeJs;
  }
}

/**
 * Pays an order on our own page with Stripe's embedded payment form. The retry endpoint
 * hands back a payable session (renewing an expired one, refusing one already paid), and
 * Stripe returns the customer to the order success page once the payment is confirmed.
 */
export function PaymentEntry({ sessionId }: { sessionId: string }) {
  const [stripeReady, setStripeReady] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const started = useRef(false);
  const valid = /^cs_[A-Za-z0-9_]+$/.test(sessionId);

  useEffect(() => {
    if (!valid || !stripeReady || started.current) return;
    started.current = true;
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    if (!window.Stripe || !publishableKey) {
      setState("error");
      setError("Payment is temporarily unavailable. Please try again later.");
      return;
    }
    const stripe = window.Stripe(publishableKey);
    const clientSecret = fetch("/api/payments/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.payment?.clientSecret)
          throw new Error(result.error ?? "Payment is unavailable. Please try again.");
        // An expired checkout is renewed; keep the address bar on the session being paid.
        if (result.payment.sessionId && result.payment.sessionId !== sessionId)
          window.history.replaceState(null, "", `/pay?session=${encodeURIComponent(result.payment.sessionId)}`);
        return result.payment.clientSecret as string;
      })
      .catch((reason) => {
        setState("error");
        setError(reason instanceof Error ? reason.message : "Please try again.");
        throw reason;
      });
    const checkout = stripe.initCheckoutFormSdk({ clientSecret, appearance });
    const form = checkout.createForm({ layout: "expanded" });
    form.mount("#checkout-form");
    void checkout
      .loadActions()
      .then((result) => {
        if (result.type !== "success") throw new Error(result.error.message ?? "Payment could not be loaded.");
        setState("ready");
        form.on("confirm", async (event) => {
          try {
            await result.actions.confirm({ formConfirmEvent: event });
          } catch (reason) {
            console.error("Payment confirmation error:", reason);
          }
        });
      })
      .catch((reason) => {
        setState("error");
        setError((current) => current || (reason instanceof Error ? reason.message : "Please try again."));
      });
  }, [sessionId, stripeReady, valid]);

  if (!valid)
    return (
      <section className="payment-entry" aria-label="Secure payment">
        <h1>This payment link is invalid</h1>
        <p role="alert">
          Reopen your invoice and use its Pay now button. If you still cannot continue, contact the bakery for a new
          payment link.
        </p>
        <a className="button button-secondary" href="/contact">
          Contact the bakery
        </a>
      </section>
    );
  return (
    <section className="payment-entry" aria-label="Secure payment">
      {/* Stripe.js must load from js.stripe.com, never bundled or self-hosted. */}
      <Script src="https://js.stripe.com/dahlia/stripe.js" onReady={() => setStripeReady(true)} />
      <span className="overline">Secure payment</span>
      <h1>Complete your order</h1>
      <p>Your card details go straight to Stripe. Already paid? We’ll confirm that here and prevent another payment.</p>
      {state === "loading" && (
        <p role="status" className="payment-polling">
          Preparing secure checkout…
        </p>
      )}
      <div id="checkout-form" className="payment-form" hidden={state === "error"} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {state === "error" && (
        <a className="button button-secondary" href="/checkout">
          Back to checkout
        </a>
      )}
    </section>
  );
}
