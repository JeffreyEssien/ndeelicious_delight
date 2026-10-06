"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import type { PublicReview } from "@/types/content";

export function ProductReviews({
  productName,
  reviews,
}: {
  productId: string;
  productName: string;
  reviews: PublicReview[];
}) {
  const t = useCustomerText("product reviews");

  const average = reviews.length ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length : 0;
  return (
    <section className="section product-reviews">
      <div className="site-container">
        <div className="reviews-head">
          <div>
            <span className="overline">{t("Verified customers")}</span>
            <h2>
              {t("Reviews of ")}
              {productName}
            </h2>
            <p>
              {reviews.length ? (
                <>
                  <b>{average.toFixed(1)}</b> ★★★★★ · {reviews.length}{" "}
                  {reviews.length === 1 ? t("review") : t("reviews")}
                </>
              ) : (
                t("No verified reviews yet")
              )}
            </p>
          </div>
          <p className="verified-review-note">
            {t("Reviews can only be submitted through the private link emailed after a completed order.")}
          </p>
        </div>
        {!!reviews.length && (
          <div className="review-grid">
            {reviews.map((review) => (
              <article key={review.id}>
                <span>{"★".repeat(review.rating)}</span>
                <h3>{review.title ?? t("Customer review")}</h3>
                <p>{review.body}</p>
                <small>
                  {review.customerName} {t("· Verified purchase")}
                </small>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
