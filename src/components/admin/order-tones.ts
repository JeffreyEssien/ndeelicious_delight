// Colour family for order and cake request stages, shared by the Orders list and the order panel.
export const stageTone: Record<string, string> = {
  PENDING_PAYMENT: "wait",
  QUOTE_REQUIRED: "wait",
  DRAFT: "quiet",
  QUOTE_SENT: "info",
  CUSTOMER_APPROVED: "new",
  PAID: "new",
  CONFIRMED: "info",
  PREPARING: "work",
  READY: "done",
  OUT_FOR_DELIVERY: "done",
  DELIVERED: "quiet",
  CANCELLED: "stop",
  FAILED: "stop",
  REFUNDED: "stop",
};
export const paymentTone: Record<string, string> = {
  SUCCEEDED: "done",
  PENDING: "wait",
  UNPAID: "wait",
  FAILED: "stop",
  REFUNDED: "stop",
  PARTIALLY_REFUNDED: "stop",
};
