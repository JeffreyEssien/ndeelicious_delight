import { cakeAvailability } from "@/features/cakes/availability";
import { FulfilmentError } from "@/features/fulfilment/types";
import { optionsForCakeType } from "@/features/cakes/options";
import { leadTimeLabel } from "@/features/cakes/lead-time";
import { getCustomerEmailText } from "@/lib/customer-text";
import { calculateCakeQuote } from "@/features/cakes/pricing";
import { CommerceError } from "@/features/checkout/pricing";
import { cakeConfigurationSchema } from "@/validations/cake";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { sendEmailToActiveAdmins } from "@/lib/email/admin-recipients";
import { pushToAdmins } from "@/lib/push/send";
import { getCakeConfiguration } from "@/lib/data/settings";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";
import { deleteImage, imageFolder, toStoragePath, uploadImage } from "@/lib/cloudinary";

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
    const limited = await enforcePublicRateLimit(request, { scope: "cake-request", maximum: 5, windowSeconds: 3600 });
    if (limited) return limited;
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
    const cakeType = configuration.cakeTypes.find((type) => type.id === parsed.data.cakeTypeId && type.active);
    if (!cakeType) throw new CommerceError("INVALID_CAKE_TYPE", "Choose an available cake type.");
    const quote = calculateCakeQuote(parsed.data, optionsForCakeType(configuration, cakeType.id), {
      cakeType,
      timezone: configuration.timezone,
    });
    if (configuration.fulfilment)
      cakeAvailability({ ...configuration.fulfilment, cakeType, requestedDate: parsed.data.deliveryDate });
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
    // Reference photos are private: stored as authenticated Cloudinary images only the admin can open.
    const referenceImage = reference
      ? await uploadImage(reference, imageFolder("cake-references", customer.id), "authenticated")
      : null;
    const referencePath = referenceImage ? toStoragePath(referenceImage.publicId) : null;
    const { error } = await service.from("custom_cake_orders").insert({
      request_number: requestNumber,
      customer_id: customer.id,
      customer_name: parsed.data.customerName,
      email: customerEmail,
      phone: parsed.data.phone,
      configuration: {
        ...parsed.data,
        cakeType: cakeType.name,
        minimumLeadTime: leadTimeLabel(cakeType),
        bakeryTimezone: configuration.timezone,
      },
      cake_type_id: cakeType.id,
      lead_time_snapshot: { ...cakeType, timezone: configuration.timezone },
      requested_date: parsed.data.deliveryDate,
      estimated_total: quote.estimatedTotal,
      status: quote.quoteRequired ? "QUOTE_REQUIRED" : "DRAFT",
      reference_urls: referencePath ? [referencePath] : [],
      customer_note: parsed.data.customerNote,
    });
    if (error) {
      if (referenceImage) await deleteImage(referenceImage.publicId, "authenticated");
      throw error;
    }
    const { t, frame } = await getCustomerEmailText(service);
    await Promise.all([
      sendTransactionalEmail({
        to: customerEmail,
        subject: t("Cake request {number} received", { number: requestNumber }),
        html: emailFrame(
          t("Your cake request is with us"),
          `<p>${escapeHtml(t("Thank you, {name}. We’ll review request {number} and reply with the next step.", { name: parsed.data.customerName, number: requestNumber }))}</p>`,
          frame,
        ),
      }),
      pushToAdmins(service, {
        title: `New cake request ${requestNumber}`,
        body: `${parsed.data.customerName} · ${parsed.data.occasion} for ${parsed.data.deliveryDate}`,
        url: "/admin/custom-cakes",
        tag: `admin-cake-${requestNumber}`,
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
    if (error instanceof CommerceError || error instanceof FulfilmentError)
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    return Response.json({ error: "We couldn’t price this cake. Please try again." }, { status: 500 });
  }
}
