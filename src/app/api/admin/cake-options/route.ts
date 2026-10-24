import { requireAdminRequest } from "@/lib/auth/admin-request";

// The product editor reads the flavour / filling / size libraries from here so it always
// reflects the latest "Sizes, flavours and cake options" edits, not a page-load snapshot.
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.db
    .from("custom_cake_options")
    .select("type,name,price_adjustment,active,sort_order")
    .in("type", ["flavour", "filling", "size"])
    .eq("active", true)
    .order("type")
    .order("sort_order");
  if (error) return Response.json({ error: "Cake options could not be loaded." }, { status: 503 });
  const rows = data ?? [];
  return Response.json(
    {
      flavours: rows.filter((row) => row.type === "flavour").map((row) => row.name),
      fillings: rows.filter((row) => row.type === "filling").map((row) => row.name),
      sizes: rows.filter((row) => row.type === "size").map((row) => ({ name: row.name, price: row.price_adjustment })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
