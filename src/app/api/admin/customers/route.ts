import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const params = new URL(request.url).searchParams;
  const parsed = z
    .object({
      q: z.string().trim().max(200),
      page: z.coerce.number().int().min(1).max(1000000),
      size: z.coerce.number().refine((value) => [25, 50, 100].includes(value)),
    })
    .safeParse({ q: params.get("q") ?? "", page: params.get("page") ?? 1, size: params.get("size") ?? 25 });
  if (!parsed.success) return Response.json({ error: "Invalid customer filters." }, { status: 400 });
  const { data, error } = await auth.db.rpc("admin_customer_page", {
    p_query: parsed.data.q,
    p_page: parsed.data.page,
    p_size: parsed.data.size,
  });
  if (error) return Response.json({ error: "Customers could not be loaded. Retry." }, { status: 503 });
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
