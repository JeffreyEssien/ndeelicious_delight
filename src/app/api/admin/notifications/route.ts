import { requireAdminRequest } from "@/lib/auth/admin-request";

export type AdminNotification = {
  id: string;
  type: "order" | "cake" | "review" | "message";
  title: string;
  detail: string;
  href?: string;
  createdAt: string;
};

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const since = () => new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

// Admin in-app notifications are derived from the actionable state already in the
// database — new paid orders, cake requests awaiting a quote, reviews to moderate and
// unresolved contact messages — so no extra table or migration is needed. "Unread" is
// tracked per-device from the client against each item's createdAt.
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;

  const [orders, cakes, reviews, messages] = await Promise.all([
    auth.db
      .from("orders")
      .select("id,order_number,customer_name,status,created_at")
      .not("status", "in", "(PENDING_PAYMENT,FAILED)")
      .gte("created_at", since())
      .order("created_at", { ascending: false })
      .limit(10),
    auth.db
      .from("custom_cake_orders")
      .select("id,request_number,customer_name,status,created_at")
      .eq("status", "QUOTE_REQUIRED")
      .order("created_at", { ascending: false })
      .limit(10),
    auth.db
      .from("reviews")
      .select("id,customer_name,rating,status,created_at,products(name)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(10),
    auth.db
      .from("contact_messages")
      .select("id,name,subject,created_at,resolved_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const notifications: AdminNotification[] = [];
  for (const order of orders.data ?? [])
    notifications.push({
      id: `order:${order.id}`,
      type: "order",
      title: `New order ${order.order_number}`,
      detail: `${order.customer_name} · ${label(order.status)}`,
      href: `/admin/orders?detail=${encodeURIComponent(order.order_number)}`,
      createdAt: order.created_at,
    });
  for (const cake of cakes.data ?? [])
    notifications.push({
      id: `cake:${cake.id}`,
      type: "cake",
      title: `Cake quote requested ${cake.request_number}`,
      detail: `${cake.customer_name} · send a price`,
      href: `/admin/custom-cakes?detail=${encodeURIComponent(cake.id)}`,
      createdAt: cake.created_at,
    });
  for (const review of reviews.data ?? []) {
    const product = Array.isArray(review.products) ? review.products[0]?.name : undefined;
    notifications.push({
      id: `review:${review.id}`,
      type: "review",
      title: `${review.rating}★ review needs approval`,
      detail: `${review.customer_name}${product ? ` · ${product}` : ""}`,
      href: "/admin/reviews",
      createdAt: review.created_at,
    });
  }
  for (const message of messages.data ?? [])
    notifications.push({
      id: `message:${message.id}`,
      type: "message",
      title: `Message from ${message.name}`,
      detail: message.subject,
      createdAt: message.created_at,
    });

  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return Response.json(
    { notifications: notifications.slice(0, 25), serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
