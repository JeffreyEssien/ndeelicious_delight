"use client";

import { type FormEvent, useState } from "react";
import { Input, Textarea } from "@/components/ui/primitives";

export function VerifiedReviewForm({ token, productName }: { token: string; productName: string }) {
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, rating, title: form.get("title"), body: form.get("body") }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return setError(payload?.error ?? "We couldn’t save your review.");
    setDone(true);
  }
  if (done)
    return (
      <div className="review-invite-card review-invite-success">
        <span className="success-mark">✓</span>
        <h1>Thank you for your review.</h1>
        <p>It has been verified against your purchase and will appear after moderation.</p>
      </div>
    );
  return (
    <form className="review-invite-card review-form" onSubmit={submit}>
      <span className="overline">Verified purchase</span>
      <h1>How was your {productName}?</h1>
      <p>Your private invitation confirms that this review comes from a completed order.</p>
      <fieldset>
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            type="button"
            className={value <= rating ? "active" : ""}
            onClick={() => setRating(value)}
            key={value}
          >
            ★
          </button>
        ))}
      </fieldset>
      <Input name="title" label="Review title" required />
      <Textarea name="body" label="Your review" rows={5} required />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button button-primary" disabled={busy}>
        {busy ? "Submitting…" : "Submit verified review"}
      </button>
    </form>
  );
}
