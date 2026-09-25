import { z } from "zod";
import { after } from "next/server";
import { recordAdminAudit } from "@/lib/audit/admin-audit";
import { readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { createStripeRefund, PaymentConfigurationError } from "@/lib/payments/stripe";
import { deliverPendingOrderNotifications } from "@/lib/orders/notifications";

const schema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.uuid(),
});

type RefundPreparation = {
  refundId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amount: number;
  paymentIntentId: string;
};

export async function POST(request: Request, context: RouteContext<"/api/admin/orders/[orderNumber]/refund">) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid refund amount and reason." }, { status: 400 });
  const { orderNumber } = await context.params;
  let previousValue: unknown;
  try {
    previousValue = await readAdminAuditState(auth.db, { type: "order", orderNumber });
  } catch {
    return Response.json({ error: "The order could not be verified for auditing." }, { status: 500 });
  }
  const { data, error } = await auth.db.rpc("begin_order_refund", {
    p_order_number: orderNumber,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_admin_id: auth.admin.id,
  });
  if (error) {
    const message = error.message.includes("INVALID_REFUND_AMOUNT")
      ? "The refund exceeds the remaining paid amount."
      : error.message.includes("NOT_REFUNDABLE") || error.message.includes("PAYMENT_INTENT_MISSING")
        ? "This order does not have a refundable Stripe payment."
        : "The refund could not be started.";
    return Response.json({ error: message }, { status: 409 });
  }
  const refund = data as RefundPreparation;
  try {
    const order = await readAdminAuditState(auth.db, { type: "order", orderNumber });
    await recordAdminAudit(auth.db, auth, {
      action: "REFUND_INITIATED",
      entityType: "order_refund",
      entityId: refund.refundId,
      previousValue,
      newValue: {
        order,
        refund: { id: refund.refundId, amount: refund.amount, reason: parsed.data.reason, status: refund.status },
      },
      metadata: { orderNumber },
    });
  } catch {
    if (refund.status === "PENDING") {
      await auth.db.rpc("fail_order_refund", { p_refund_id: refund.refundId, p_error_code: "audit-record-failed" });
    }
    return Response.json(
      { error: "The refund was not sent because its audit record could not be verified." },
      { status: 500 },
    );
  }
  if (refund.status === "SUCCEEDED") return Response.json({ ok: true, alreadyProcessed: true });
  try {
    const stripeRefund = await createStripeRefund({
      paymentIntentId: refund.paymentIntentId,
      amount: refund.amount,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const attached = await auth.db.rpc("attach_order_refund_provider", {
      p_refund_id: refund.refundId,
      p_provider_refund_id: stripeRefund.id,
    });
    if (attached.error) throw attached.error;
    if (["failed", "canceled"].includes(stripeRefund.status)) {
      await auth.db.rpc("fail_order_refund", {
        p_refund_id: refund.refundId,
        p_error_code: `stripe-refund-${stripeRefund.status}`,
      });
      return Response.json({ error: "Stripe could not complete the refund." }, { status: 502 });
    }
    if (stripeRefund.status !== "succeeded")
      return Response.json({ ok: true, pending: true, refundId: stripeRefund.id }, { status: 202 });
    const completed = await auth.db.rpc("complete_order_refund", {
      p_refund_id: refund.refundId,
      p_provider_refund_id: stripeRefund.id,
    });
    if (completed.error) throw completed.error;
    after(() => deliverPendingOrderNotifications(auth.db, orderNumber));
    return Response.json({ ok: true, refundId: stripeRefund.id, ...completed.data });
  } catch (reason) {
    const code = reason instanceof PaymentConfigurationError ? "stripe-not-configured" : "stripe-refund-failed";
    await auth.db.rpc("fail_order_refund", { p_refund_id: refund.refundId, p_error_code: code });
    return Response.json(
      {
        error:
          reason instanceof PaymentConfigurationError
            ? "Stripe refunds are not configured."
            : "Stripe could not process the refund. No order status was changed.",
      },
      { status: reason instanceof PaymentConfigurationError ? 503 : 502 },
    );
  }
}
