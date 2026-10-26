import { invalidateStorefrontCache } from "@/lib/cache/storefront";
import { withIntegrationAdmin } from "@/lib/auth/integration-request";
import { applyProductCollection, productSaveArguments, productSaveError } from "@/lib/data/product-write";
import { categorySlug, productInputSchema } from "@/validations/product";
import { productImportSchema, slugify, toProductInput } from "@/validations/product-import";

export const runtime = "nodejs";

// Creates a product from a Google Form submission (see google-forms/README.md).
export async function POST(request: Request) {
  return withIntegrationAdmin(request, async ({ db, admin, sessionId }) => {
    const submitted = productImportSchema.safeParse(await request.json().catch(() => null));
    if (!submitted.success) return Response.json({ error: issueMessage(submitted.error) }, { status: 400 });
    const data = submitted.data;

    const [{ data: category }, { data: collections }] = await Promise.all([
      db.from("categories").select("id").eq("slug", categorySlug(data.category)).single(),
      db.from("collections").select("id,name").eq("parent", data.category),
    ]);
    if (!category) return Response.json({ error: "Product category is missing." }, { status: 400 });
    let collectionId: string | null = null;
    if (data.collection) {
      const match = collections?.find((item) => item.name.trim().toLowerCase() === data.collection.toLowerCase());
      if (!match) return Response.json({ error: `Sub-category "${data.collection}" was not found.` }, { status: 400 });
      collectionId = match.id;
    }

    // An explicit slug must be unique; a generated one gets a numeric suffix so repeat names still import.
    let slug = data.slug || slugify(data.name);
    if (!data.slug) {
      const { data: taken } = await db.from("products").select("slug").like("slug", `${slug}%`);
      const used = new Set((taken ?? []).map((row) => row.slug));
      for (let suffix = 2; used.has(slug); suffix++) slug = `${slugify(data.name)}-${suffix}`;
    }

    const parsed = productInputSchema.safeParse(toProductInput(data, slug, collectionId));
    if (!parsed.success) return Response.json({ error: issueMessage(parsed.error) }, { status: 400 });
    const { data: id, error } = await db.rpc("admin_save_product", {
      p_id: null,
      ...productSaveArguments(parsed.data, category.id),
      p_admin_id: admin.id,
      p_session_id: sessionId,
    });
    if (error) {
      const result = productSaveError(error);
      return Response.json({ error: result.error }, { status: result.status });
    }
    await applyProductCollection(db, id, parsed.data.category, parsed.data.collectionId);
    invalidateStorefrontCache();
    return Response.json({ ok: true, id, slug, status: parsed.data.status }, { status: 201 });
  });
}

function issueMessage(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const issue = error.issues[0];
  if (!issue) return "Check the product details.";
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}
