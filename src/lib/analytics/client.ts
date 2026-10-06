export type CommerceEventName =
  | "PRODUCT_VIEWED"
  | "ADD_TO_CART"
  | "REMOVE_FROM_CART"
  | "CHECKOUT_STARTED"
  | "COUPON_APPLIED"
  | "SEARCH_PERFORMED"
  | "CAKE_BUILDER_STARTED"
  | "CAKE_BUILDER_COMPLETED";

const anonymousIdKey = "ndee-analytics-id";

function anonymousId() {
  try {
    const existing = window.localStorage.getItem(anonymousIdKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(anonymousIdKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function trackCommerceEvent(
  eventName: CommerceEventName,
  options: { productId?: string; metadata?: Record<string, string | number | boolean> } = {},
) {
  if (typeof window === "undefined") return;
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (privacyNavigator.globalPrivacyControl) return;
  const payload = JSON.stringify({
    eventName,
    anonymousId: anonymousId(),
    productId: options.productId,
    path: window.location.pathname,
    metadata: options.metadata ?? {},
    occurredAt: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt a customer action.
  }
}
