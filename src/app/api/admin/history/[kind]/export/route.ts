import { requireAdminRequest } from "@/lib/auth/admin-request";
import { getHistoryPage, parseHistoryQuery } from "@/lib/data/admin-history";
const cell = (value: unknown) =>
  `"${String(value ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""')}"`;
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { kind } = await context.params;
  if (kind !== "orders" && kind !== "cakes") return Response.json({ error: "Unknown workspace." }, { status: 404 });
  let query: ReturnType<typeof parseHistoryQuery>;
  try {
    query = parseHistoryQuery(kind, new URL(request.url).searchParams);
  } catch {
    return Response.json({ error: "Invalid export filters." }, { status: 400 });
  }
  query = { ...query, page: 1, size: 100, asOf: query.asOf || new Date().toISOString() };
  // Fetch the first page before committing response headers so failures are visible.
  let first: Awaited<ReturnType<typeof getHistoryPage>>;
  try {
    first = await getHistoryPage(auth.db, kind, query);
  } catch {
    return Response.json({ error: "Export could not start. Retry." }, { status: 503 });
  }
  const encoder = new TextEncoder();
  let nextPage = 1;
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          "Number,Customer,Created,Requested,Stage,Payment,Fulfilment,Items,Total (minor units),Currency\r\n",
        ),
      );
    },
    async pull(controller) {
      try {
        const page = nextPage === 1 ? first : await getHistoryPage(auth.db, kind, { ...query, page: nextPage });
        if (cancelled) return;
        const csv = page.rows
          .map((row) =>
            [
              row.number,
              row.customer,
              row.createdAt,
              row.deadline,
              row.status,
              row.paymentStatus,
              row.fulfilment,
              row.items,
              row.total,
              row.currency,
            ]
              .map(cell)
              .join(","),
          )
          .join("\r\n");
        if (csv) controller.enqueue(encoder.encode(`${csv}\r\n`));
        nextPage++;
        if (page.page * page.size >= page.total) controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-summary.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
