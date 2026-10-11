"use client";
import { useState } from "react";
export function PaymentEntry({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment is unavailable. Please try again.");
      window.location.assign(result.payment.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <section className="payment-entry" aria-label="Secure payment">
      <span className="overline">Secure payment</span>
      <h1>Complete your order</h1>
      <p>
        Continue to Stripe to pay securely. We’ll check your order and renew an expired checkout before you continue.
      </p>
      <button
        type="button"
        className="button button-primary"
        disabled={busy || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)}
        onClick={pay}
      >
        {busy ? "Preparing secure checkout…" : "Continue to payment"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <small>Already paid? We’ll confirm that here and prevent another payment.</small>
    </section>
  );
}
