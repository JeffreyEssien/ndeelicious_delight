import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";

const schema = z.object({
  presentation: z.object({
    notes: z.array(z.string().trim().min(1).max(500)).max(20),
    footerMessage: z.string().trim().max(1_000),
    design: z.enum(["classic", "modern", "minimal"]),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showSku: z.boolean(),
    showBusinessTaxNumber: z.boolean(),
    showPaymentDetails: z.boolean(),
  }),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Check the presentation options and try again." }, { status: 400 });
  const { id } = await params;
  const { data: current, error: readError } = await auth.db
    .from("business_documents")
    .select("presentation_snapshot")
    .eq("id", id)
    .maybeSingle();
  if (readError || !current) return Response.json({ error: "Document not found." }, { status: 404 });
  const presentation = {
    ...(current.presentation_snapshot as Record<string, unknown>),
    ...parsed.data.presentation,
  };
  const { error } = await auth.db.rpc("update_document_presentation", {
    p_document_id: id,
    p_presentation: presentation,
    p_admin_id: auth.admin.id,
  });
  if (error) return Response.json({ error: "Presentation changes could not be saved." }, { status: 500 });
  return Response.json({ presentation });
}
