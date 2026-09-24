"use client";
import { type FormEvent, useState } from "react";
import { Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/providers";
import type { PublicReview } from "@/types/content";
export function ProductReviews({
  productId,
  productName,
  reviews,
}: {
  productId: string;
  productName: string;
  reviews: PublicReview[];
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useToast();
  const average = reviews.length ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : 0;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId,
        customerName: form.get("customerName"),
        title: form.get("title"),
        body: form.get("body"),
        rating,
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "We couldn’t save your review.");
      return;
    }
    setDone(true);
    setOpen(false);
    notify("Review received for moderation.");
  }
  return (
    <section className="section product-reviews">
      <div className="site-container">
        <div className="reviews-head">
          <div>
            <span className="overline">Loved by our customers</span>
            <h2>Reviews</h2>
            <p>
              {reviews.length ? (
                <>
                  <b>{average.toFixed(1)}</b> ★★★★★ · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                </>
              ) : (
                "No published reviews yet"
              )}
            </p>
          </div>
          <button type="button" className="button button-secondary" onClick={() => setOpen((v) => !v)}>
            Write a review
          </button>
        </div>
        {open && (
          <form className="review-form" onSubmit={submit}>
            <h3>Review {productName}</h3>
            <fieldset>
              <legend>Your rating</legend>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" className={n <= rating ? "active" : ""} onClick={() => setRating(n)} key={n}>
                  ★
                </button>
              ))}
            </fieldset>
            <Input name="customerName" label="Your name" required />
            <Input name="title" label="Review title" required />
            <Textarea name="body" label="Your review" rows={4} required />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div>
              <button className="button button-ghost" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit review"}
              </button>
            </div>
          </form>
        )}
        {done && <p className="review-thanks">✓ Thank you. Your review will appear after moderation.</p>}
        {!!reviews.length && (
          <div className="review-grid">
            {reviews.map((review) => (
              <article key={review.id}>
                <span>{"★".repeat(review.rating)}</span>
                <h3>{review.title ?? "Customer review"}</h3>
                <p>{review.body}</p>
                <small>{review.customerName}</small>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
