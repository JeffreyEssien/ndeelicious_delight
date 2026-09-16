import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional(), subject: z.string().trim().min(2).max(100),
  message: z.string().trim().min(10).max(3000),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please complete the contact form." }, { status: 400 });
  const { error } = await createServiceClient().from("contact_messages").insert(parsed.data);
  if (error) return Response.json({ error: "We couldn’t send your message. Please try again." }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
