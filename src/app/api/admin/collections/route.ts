import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const schema = z.object({
  collections: z
    .array(
      z.object({
        id: z.string(),
        parent: z.enum(["PASTRIES", "READY_TO_BAKE", "CUSTOM_CAKES"]),
        name: z.string().trim().min(1).max(80),
        slug: z.string().trim().max(120).optional(),
        sortOrder: z.number().int().min(0),
        active: z.boolean(),
      }),
    )
    .max(200),
});

export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.db
    .from("collections")
    .select("id,parent,name,slug,sort_order,active")
    .order("parent")
    .order("sort_order");
  if (error) return Response.json({ error: "Categories could not be loaded." }, { status: 503 });
  return Response.json(
    {
      collections: (data ?? []).map((row) => ({
        id: row.id,
        parent: row.parent,
        name: row.name,
        slug: row.slug,
        sortOrder: row.sort_order,
        active: row.active,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the categories and try again." }, { status: 400 });

  const rows = parsed.data.collections.map((item) => ({
    id: z.uuid().safeParse(item.id).success ? item.id : crypto.randomUUID(),
    parent: item.parent,
    name: item.name,
    slug: item.slug?.length ? slugify(item.slug) || slugify(item.name) : slugify(item.name),
    sort_order: item.sortOrder,
    active: item.active,
    updated_at: new Date().toISOString(),
  }));

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.slug) return Response.json({ error: `"${row.name}" needs a valid link name.` }, { status: 400 });
    if (seen.has(row.slug))
      return Response.json({ error: `Two categories share the link "${row.slug}".` }, { status: 400 });
    seen.add(row.slug);
  }

  // Remove categories the owner deleted (products/cakes pointing at them are detached via FK).
  const keepIds = rows.map((row) => row.id);
  const removed = keepIds.length
    ? await auth.db
        .from("collections")
        .delete()
        .not("id", "in", `(${keepIds.join(",")})`)
    : await auth.db.from("collections").delete().not("id", "is", null);
  if (removed.error) return Response.json({ error: "Categories could not be updated." }, { status: 500 });

  if (rows.length) {
    const saved = await auth.db.from("collections").upsert(rows);
    if (saved.error) return Response.json({ error: "Categories could not be saved." }, { status: 400 });
  }

  invalidateStorefrontCache();
  return Response.json({
    ok: true,
    ids: Object.fromEntries(parsed.data.collections.map((item, index) => [item.id, rows[index].id])),
  });
}
