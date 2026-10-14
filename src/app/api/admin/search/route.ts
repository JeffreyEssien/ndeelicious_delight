import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";

export type AdminSearchResult = {
  type: "order" | "cake" | "product" | "customer";
  id: string;
  label: string;
  sublabel: string;
  href: string;
};

// PostgREST `or` filters treat these as syntax, so strip them from the raw term
// before interpolating into an ilike pattern.
const sanitize = (value: string) => value.replace(/[%,()*\\]/g, " ").trim();

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({ q: z.string().trim().min(2).max(120) })
    .safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ results: [] });
  const term = sanitize(parsed.data.q);
  if (!term) return Response.json({ results: [] });
  const like = `%${term}%`;

  const [orders, cakes, products, customers] = await Promise.all([
    auth.db
      .from("orders")
      .select("order_number,customer_name,status")
      .or(`order_number.ilike.${like},customer_name.ilike.${like},email.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    auth.db
      .from("custom_cake_orders")
      .select("id,request_number,customer_name,status")
      .or(`request_number.ilike.${like},customer_name.ilike.${like},email.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(5),
    auth.db
      .from("products")
      .select("name,slug,status")
      .or(`name.ilike.${like},slug.ilike.${like},sku.ilike.${like}`)
      .order("name")
      .limit(5),
    auth.db.rpc("admin_customer_page", { p_query: term, p_page: 1, p_size: 25 }),
  ]);

  const results: AdminSearchResult[] = [];
  const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

  for (const order of orders.data ?? [])
    results.push({
      type: "order",
      id: order.order_number,
      label: order.order_number,
      sublabel: `${order.customer_name} · ${label(order.status)}`,
      href: `/admin/orders?detail=${encodeURIComponent(order.order_number)}`,
    });
  for (const cake of cakes.data ?? [])
    results.push({
      type: "cake",
      id: cake.id,
      label: cake.request_number,
      sublabel: `${cake.customer_name} · ${label(cake.status)}`,
      href: `/admin/custom-cakes?detail=${encodeURIComponent(cake.id)}`,
    });
  for (const product of products.data ?? [])
    results.push({
      type: "product",
      id: product.slug,
      label: product.name,
      sublabel: label(product.status),
      href: `/admin/products?q=${encodeURIComponent(product.name)}`,
    });
  const customerRows: Array<{ name: string; email: string }> = Array.isArray(customers.data?.rows)
    ? customers.data.rows.slice(0, 5)
    : [];
  for (const customer of customerRows)
    results.push({
      type: "customer",
      id: customer.email,
      label: customer.name || customer.email,
      sublabel: customer.email,
      href: `/admin/customers?q=${encodeURIComponent(customer.email)}`,
    });

  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
