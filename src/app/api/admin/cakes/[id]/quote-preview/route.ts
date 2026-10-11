import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { previewCakeQuote } from "@/lib/documents/service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = z
    .object({ quotedTotal: z.number().int().positive().max(1000000000) })
    .safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success)
    return Response.json({ error: "Enter a valid quote amount." }, { status: 400 });
  try {
    return Response.json(await previewCakeQuote(auth.db, id, parsed.data.quotedTotal), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "This request could not be previewed. Refresh and check its linked order." },
      { status: 409 },
    );
  }
}
