import { calculateCakeQuote } from "@/features/cakes/pricing";
import { CommerceError } from "@/features/checkout/pricing";
import { cakeConfigurationSchema } from "@/validations/cake";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { sendEmailToActiveAdmins } from "@/lib/email/admin-recipients";
import { getCakeConfiguration } from "@/lib/data/settings";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function requestPayload(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return { body: (await request.json()) as unknown, reference: null };
  }
  const form = await request.formData();
  const raw = form.get("configuration");
  const reference = form.get("reference");
  return {
    body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : null,
    reference: reference instanceof File && reference.size > 0 ? reference : null,
  };
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
    const { body, reference } = await requestPayload(request);
    const parsed = cakeConfigurationSchema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Please complete the cake details.", issues: parsed.error.flatten() },
        { status: 400 },
      );
    const extension = reference ? imageExtensions[reference.type] : undefined;
    if (reference && (!extension || reference.size > 5 * 1024 * 1024)) {
      return Response.json({ error: "Use a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
    }
    const service = createServiceClient();
    const configuration = await getCakeConfiguration(service);
    const quote = calculateCakeQuote(parsed.data, configuration.options, {
      leadTimeHours: configuration.leadTimeHours,
    });
    const customerEmail = parsed.data.email.toLowerCase();
    const { data: customer, error: customerError } = await service
      .from("customers")
      .upsert(
        { email: customerEmail, name: parsed.data.customerName, phone: parsed.data.phone },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (customerError) throw customerError;
    const requestNumber = `CC-${Date.now().toString().slice(-7)}`;
    const referencePath = reference ? `${customer.id}/${crypto.randomUUID()}.${extension}` : null;
    if (reference && referencePath) {
      const { error: uploadError } = await service.storage
        .from("cake-reference-images")
        .upload(referencePath, reference, {
          contentType: reference.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
    }
    const { error } = await service.from("custom_cake_orders").insert({
      request_number: requestNumber,
      customer_id: customer.id,
      customer_name: parsed.data.customerName,
      email: customerEmail,
      phone: parsed.data.phone,
      configuration: parsed.data,
      requested_date: parsed.data.deliveryDate,
      estimated_total: quote.estimatedTotal,
      status: quote.quoteRequired ? "QUOTE_REQUIRED" : "DRAFT",
      reference_urls: referencePath ? [referencePath] : [],
      customer_note: parsed.data.customerNote,
    });
    if (error) {
      if (referencePath) await service.storage.from("cake-reference-images").remove([referencePath]);
      throw error;
    }
    await Promise.all([
      sendTransactionalEmail({
        to: customerEmail,
        subject: `Cake request ${requestNumber} received`,
        html: emailFrame(
          "Your cake request is with us",
          `<p>Thank you, ${escapeHtml(parsed.data.customerName)}. We’ll review request <b>${requestNumber}</b> and reply with the next step.</p>`,
        ),
      }),
      sendEmailToActiveAdmins(service, {
        replyTo: customerEmail,
        subject: `New cake request ${requestNumber}`,
        html: emailFrame(
          "New custom cake request",
          `<p>${escapeHtml(parsed.data.customerName)} requested a ${escapeHtml(parsed.data.occasion)} cake for ${escapeHtml(parsed.data.deliveryDate)}.</p>`,
        ),
      }),
    ]);
    return Response.json(
      {
        requestNumber,
        quote: {
          estimatedTotal: quote.estimatedTotal,
          quoteRequired: quote.quoteRequired,
          earliestDate: quote.earliestDate.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "The request body is invalid." }, { status: 400 });
    if (error instanceof CommerceError)
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    return Response.json({ error: "We couldn’t price this cake. Please try again." }, { status: 500 });
  }
}
