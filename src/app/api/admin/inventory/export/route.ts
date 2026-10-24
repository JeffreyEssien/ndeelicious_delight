import { requireAdminRequest } from "@/lib/auth/admin-request";
function cell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("productId,variantId,expected,mode,quantity,product,variant,sku\r\n"));
      let cursor = "";
      try {
        while (!cancelled) {
          let query = auth.db
            .from("product_variants")
            .select("id,product_id,stock_quantity,name,sku,products(name)")
            .order("id")
            .limit(100);
          if (cursor) query = query.gt("id", cursor);
          const { data, error } = await query;
          if (cancelled) return;
          if (error) throw error;
          for (const variant of data ?? []) {
            const product = variant.products as unknown as { name: string } | { name: string }[];
            controller.enqueue(
              encoder.encode(
                `${[
                  variant.product_id,
                  variant.id,
                  variant.stock_quantity,
                  "set",
                  variant.stock_quantity,
                  (Array.isArray(product) ? product[0] : product)?.name,
                  variant.name,
                  variant.sku,
                ]
                  .map(cell)
                  .join(",")}\r\n`,
              ),
            );
            cursor = variant.id;
          }
          if (!data || data.length < 100) break;
        }
        if (!cancelled) controller.close();
      } catch (reason) {
        if (!cancelled) controller.error(reason);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="inventory.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
