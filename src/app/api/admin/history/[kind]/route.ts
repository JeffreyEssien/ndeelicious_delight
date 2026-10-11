import { requireAdminRequest } from "@/lib/auth/admin-request";
import { getHistoryPage, parseHistoryQuery } from "@/lib/data/admin-history";
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { kind } = await context.params;
  if (kind !== "orders" && kind !== "cakes") return Response.json({ error: "Unknown workspace." }, { status: 404 });
  let query: ReturnType<typeof parseHistoryQuery>;
  try {
    query = parseHistoryQuery(kind, new URL(request.url).searchParams);
  } catch {
    return Response.json({ error: "Check the filters, dates and page size." }, { status: 400 });
  }
  try {
    const page = await getHistoryPage(auth.db, kind, query);
    const paths = kind === "cakes" ? page.rows.flatMap((row) => (row.referencePath ? [row.referencePath] : [])) : [];
    const signed = paths.length
      ? await auth.db.storage.from("cake-reference-images").createSignedUrls(paths, 600)
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urls = new Map((signed.data ?? []).map((image) => [image.path, image.signedUrl]));
    page.rows = page.rows.map(({ referencePath, ...row }) => {
      const thumbnailUrl = referencePath ? urls.get(referencePath) : undefined;
      return { ...row, ...(thumbnailUrl ? { thumbnailUrl } : {}) };
    });
    return Response.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "History could not be loaded. Please retry." }, { status: 503 });
  }
}
