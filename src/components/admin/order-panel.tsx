"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBusinessSettings, useToast } from "@/components/providers";
import { Button, Input, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { formatDate, formatMoney } from "@/lib/format";
import type { AdminOrder } from "@/lib/data/admin";
import { earlyReadyMessage, isEarly } from "@/lib/orders/notice";
import type { OrderStatus } from "@/types";
import { paymentTone, stageTone } from "./order-tones";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

function mutate(body: unknown) {
  return fetch("/api/admin/mutate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The More menu opens toward whichever side of its button has room inside the panel, so it is
// never cut off whether the button lands on the left (phones) or the right (wide panels).
function placeMoreMenu(event: React.SyntheticEvent<HTMLDetailsElement>) {
  const details = event.currentTarget;
  const menu = details.querySelector<HTMLElement>(":scope > div");
  const panel = details.closest<HTMLElement>(".op") ?? document.body;
  if (!details.open || !menu) return;
  const button = details.getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  const width = menu.offsetWidth;
  details.dataset.align =
    button.left + width <= bounds.right - 8 || button.right - width < bounds.left + 8 ? "start" : "end";
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// Plain words for the activity timeline.
function describeEvent(event: AdminOrder["events"][number]) {
  if (event.toStatus) {
    const named: Record<string, string> = {
      PENDING_PAYMENT: "Order placed",
      PAID: "Payment received",
      CONFIRMED: "Order confirmed",
      PREPARING: "Preparation started",
      READY: "Marked ready",
      OUT_FOR_DELIVERY: "Sent out for delivery",
      DELIVERED: "Completed",
      CANCELLED: "Order cancelled",
      REFUNDED: "Refunded",
      FAILED: "Payment failed",
    };
    return named[event.toStatus] ?? `Moved to ${label(event.toStatus)}`;
  }
  const named: Record<string, string> = {
    EMAIL_SENT: "Customer email sent",
    EMAIL_FAILED: "Customer email failed",
  };
  return named[event.eventType] ?? label(event.eventType).replace(/^\w/, (c) => c.toUpperCase());
}

export function OrderStatusSelect({ value, onChange }: { value: OrderStatus; onChange: (value: OrderStatus) => void }) {
  const allowed: Partial<Record<OrderStatus, OrderStatus[]>> = {
    PENDING_PAYMENT: ["CANCELLED"],
    FAILED: ["CANCELLED"],
    PAID: ["CONFIRMED"],
    CONFIRMED: ["PREPARING"],
    PREPARING: ["READY"],
    READY: ["OUT_FOR_DELIVERY", "DELIVERED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
  };
  const values = allowed[value] ?? [];
  return (
    <select
      className="status-select"
      aria-label="Fulfilment stage"
      value={value}
      disabled={!values.length}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
    >
      <option value={value}>{value.replaceAll("_", " ")}</option>
      {values.map((item) => (
        <option key={item} value={item}>
          {item.replaceAll("_", " ")}
        </option>
      ))}
    </select>
  );
}

export function OrderDetail({
  order,
  close,
  onStatus,
  onRefresh,
}: {
  order: AdminOrder;
  close: () => void;
  onStatus: (id: string, status: OrderStatus) => Promise<void>;
  onRefresh?: () => Promise<void>;
}) {
  const business = useBusinessSettings();
  const money = (value: number) => formatMoney(value, order.currency, business.locale);
  const when = (iso: string) => formatDate(iso, business.locale, business.timezone);
  const paid = order.payment?.paidAt ? order.payment.amount : 0;
  const notify = useToast();
  const router = useRouter();
  const refundable = order.payment?.paidAt ? Math.max(0, order.payment.amount - order.payment.refundedAmount) : 0;
  const [note, setNote] = useState(order.internalNote);
  const [refundAmount, setRefundAmount] = useState(refundable ? String(refundable / 100) : "");
  const [refundReason, setRefundReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pickup = order.fulfilment === "pickup";
  const next: Partial<Record<OrderStatus, { stage: OrderStatus; label: string }>> = {
    PAID: { stage: "CONFIRMED", label: "Confirm order" },
    CONFIRMED: { stage: "PREPARING", label: "Start preparing" },
    PREPARING: { stage: "READY", label: "Mark ready" },
    READY: pickup
      ? { stage: "DELIVERED", label: "Mark collected" }
      : { stage: "OUT_FOR_DELIVERY", label: "Send out for delivery" },
    OUT_FOR_DELIVERY: { stage: "DELIVERED", label: "Mark delivered" },
  };
  const nextAction = next[order.status];
  const journey: [OrderStatus, string][] = pickup
    ? [
        ["PAID", "Paid"],
        ["CONFIRMED", "Confirmed"],
        ["PREPARING", "Preparing"],
        ["READY", "Ready"],
        ["DELIVERED", "Collected"],
      ]
    : [
        ["PAID", "Paid"],
        ["CONFIRMED", "Confirmed"],
        ["PREPARING", "Preparing"],
        ["READY", "Ready"],
        ["OUT_FOR_DELIVERY", "On its way"],
        ["DELIVERED", "Delivered"],
      ];
  const reached = journey.findIndex(([stage]) => stage === order.status);
  const closed = ["CANCELLED", "REFUNDED", "FAILED"].includes(order.status);
  const address = order.address
    ? [
        order.address.street,
        order.address.addressLine2,
        order.address.city,
        order.address.province,
        order.address.postalCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const outstanding = Math.max(0, order.total - paid);
  const paymentStatus = order.payment?.status ?? "UNPAID";

  // Marking ready inside the customer's notice period is allowed, but asks first.
  function readyCheck(stage: OrderStatus) {
    if (stage !== "READY" || !order.readyAt || !isEarly(order.readyAt)) return true;
    return window.confirm(
      earlyReadyMessage(
        [{ number: order.id, placedAt: order.date, readyAt: order.readyAt }],
        business.locale,
        business.timezone,
      ),
    );
  }
  async function changeStatus(stage: OrderStatus) {
    if (busy || !readyCheck(stage)) return;
    setBusy(true);
    try {
      await onStatus(order.id, stage);
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    if (nextAction) await changeStatus(nextAction.stage);
  }
  async function saveNote() {
    setBusy(true);
    const response = await mutate({ action: "order-note", orderNumber: order.id, note });
    setBusy(false);
    notify(response.ok ? "Internal note saved." : "The internal note could not be saved.");
  }
  async function retryNotifications() {
    setBusy(true);
    const response = await mutate({ action: "notification-retry", orderNumber: order.id });
    setBusy(false);
    notify(response.ok ? "Pending customer emails were retried." : "Customer emails could not be retried.");
  }
  async function refund() {
    const amount = Math.round(Number(refundAmount) * 100);
    if (!Number.isInteger(amount) || amount < 1 || amount > refundable || refundReason.trim().length < 3) {
      notify("Enter a valid amount and a clear refund reason.");
      return;
    }
    if (!window.confirm(`Refund ${money(amount)} for ${order.id}? Stripe will process this immediately.`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, reason: refundReason, idempotencyKey: crypto.randomUUID() }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (response.ok) {
      notify(
        payload?.pending
          ? "Stripe accepted the refund and is still processing it."
          : amount === refundable
            ? "Full refund completed."
            : "Partial refund completed.",
      );
      if (onRefresh) await onRefresh();
      else router.refresh();
    } else notify(payload?.error ?? "The refund could not be processed.");
  }

  return (
    <div className="order-detail-content op">
      <header className="op-head">
        <div>
          <span className="op-when">
            Placed {ago(order.date)} · {when(order.date)}
          </span>
          <h2>{order.customer}</h2>
          <p>
            {order.id} · {order.items} item{order.items === 1 ? "" : "s"} · {pickup ? "Pickup" : "Delivery"}
          </p>
          <div className="op-pills">
            <em className={`hw-pill is-${stageTone[order.status] ?? "quiet"}`}>{label(order.status)}</em>
            {order.status !== "PENDING_PAYMENT" && (
              <em className={`hw-pill is-${paymentTone[paymentStatus] ?? "quiet"} is-soft`}>
                {paymentStatus === "SUCCEEDED" ? "paid" : `payment ${label(paymentStatus)}`}
              </em>
            )}
          </div>
        </div>
        <div className="op-head-side">
          <button type="button" className="icon-button" onClick={close} aria-label="Close order details">
            <Icon name="close" />
          </button>
          <b className="op-total">{money(order.total)}</b>
        </div>
      </header>

      {!closed && order.status !== "PENDING_PAYMENT" && (
        <ol className="op-journey" aria-label="Order progress">
          {journey.map(([stage, title], index) => (
            <li
              key={stage}
              className={index < reached ? "is-done" : index === reached ? "is-now" : ""}
              aria-current={index === reached ? "step" : undefined}
            >
              <span>{index < reached ? <Icon name="check" /> : index + 1}</span>
              {title}
            </li>
          ))}
        </ol>
      )}

      <div className="op-actions no-print">
        {nextAction && (
          <Button className="op-next" disabled={busy} onClick={advance}>
            {busy ? "Updating…" : nextAction.label} <Icon name="arrow" />
          </Button>
        )}
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <details className="op-more" onToggle={placeMoreMenu}>
          <summary>More</summary>
          <div>
            <OrderStatusSelect value={order.status} onChange={changeStatus} />
            <Button variant="secondary" disabled={busy} onClick={retryNotifications}>
              Resend customer emails
            </Button>
          </div>
        </details>
      </div>

      <section className="op-card">
        <h3>Customer</h3>
        <div className="op-contact">
          <a href={`mailto:${order.email}`}>
            <Icon name="mail" /> {order.email}
          </a>
          {order.phone && (
            <a href={`tel:${order.phone.replace(/[^0-9+]/g, "")}`}>
              <Icon name="phone" /> {order.phone}
            </a>
          )}
        </div>
        <div className="op-where">
          <b>{pickup ? "Collecting from the bakery" : "Delivering to"}</b>
          {address && <span>{address}</span>}
          {address && (
            <a
              className="no-print"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
            >
              Directions ↗
            </a>
          )}
        </div>
        {order.customerNote && (
          <blockquote className="op-quote">
            <small>Note from {order.customer.split(" ")[0]}</small>
            {order.customerNote}
          </blockquote>
        )}
      </section>

      <section className="op-card">
        <h3>Order items</h3>
        <div className="order-lines">
          {order.lines.map((line) => (
            <div key={line.id}>
              <span>
                <b>{line.productName}</b>
                <small>
                  {line.variantName} × {line.quantity}
                  {line.packQuantity ? ` · ${line.quantity * line.packQuantity} pieces` : ""}
                </small>
                {line.configuration && (
                  <dl className="purchase-configuration">
                    {Object.entries({
                      occasion: "Occasion",
                      size: "Size",
                      flavour: "Cake flavour",
                      filling: "Filling",
                      design: "Design",
                      colours: "Preferred colours",
                    }).map(([key, title]) =>
                      line.configuration?.[key] ? (
                        <div key={key}>
                          <dt>{title}</dt>
                          <dd>{line.configuration[key]}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}
                {!!line.selections?.length && (
                  <dl className="purchase-configuration">
                    {line.selections.map((selection) => (
                      <div key={selection.group}>
                        <dt>{selection.group}</dt>
                        <dd>{selection.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </span>
              <b>{money(line.finalPrice)}</b>
            </div>
          ))}
        </div>
        <dl className="order-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(order.subtotal)}</dd>
          </div>
          {order.discountTotal > 0 && (
            <div>
              <dt>Discount</dt>
              <dd>−{money(order.discountTotal)}</dd>
            </div>
          )}
          {!pickup && (
            <div>
              <dt>Delivery</dt>
              <dd>{order.deliveryFee ? money(order.deliveryFee) : "Free"}</dd>
            </div>
          )}
          {order.taxTotal > 0 && (
            <div>
              <dt>Tax</dt>
              <dd>{money(order.taxTotal)}</dd>
            </div>
          )}
          <div>
            <dt>Total</dt>
            <dd>{money(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="op-card">
        <h3>Payment and balance</h3>
        <div className={`op-payment is-${paymentTone[paymentStatus] ?? "quiet"}`}>
          <Icon name={paymentStatus === "SUCCEEDED" ? "check" : "clock"} />
          <div>
            <b>
              {paymentStatus === "SUCCEEDED"
                ? `Paid ${money(paid)}${order.payment?.paidAt ? ` on ${when(order.payment.paidAt)}` : ""}`
                : paymentStatus === "PENDING"
                  ? "Waiting for the customer to finish paying"
                  : paymentStatus === "REFUNDED"
                    ? `Refunded ${money(order.payment?.refundedAmount ?? 0)}`
                    : paymentStatus === "PARTIALLY_REFUNDED"
                      ? `Partly refunded: ${money(order.payment?.refundedAmount ?? 0)} of ${money(order.payment?.amount ?? 0)}`
                      : paymentStatus === "FAILED"
                        ? "The payment didn’t go through"
                        : "No payment yet"}
            </b>
            {paymentStatus === "PENDING" && (
              <small>
                Stripe hasn’t confirmed this payment. If the customer says they paid, check the payment in your Stripe
                dashboard before preparing the order.
              </small>
            )}
          </div>
        </div>
        <p className="op-balance">
          Outstanding balance: <strong>{money(outstanding)}</strong>
        </p>
        {refundable > 0 && !["PENDING_PAYMENT", "FAILED", "CANCELLED"].includes(order.status) && (
          <details className="op-refund no-print">
            <summary>Refund {money(refundable)} or part of it</summary>
            <div className="refund-form">
              <Input
                label={`Refund amount (${order.currency})`}
                type="number"
                min="0.01"
                max={refundable / 100}
                step="0.01"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
              <Textarea
                label="Reason for refund"
                rows={3}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
              />
              <Button disabled={busy} variant="danger" onClick={refund}>
                {busy ? "Processing…" : "Refund through Stripe"}
              </Button>
            </div>
          </details>
        )}
      </section>

      <section className="op-card order-documents-area">
        <h3>Documents</h3>
        <div className="op-docs">
          {order.payment?.paidAt && (
            <Link href={`/admin/documents/orders/${encodeURIComponent(order.id)}/receipt`} target="_blank">
              <Icon name="check" />
              <span>
                <b>Receipt</b>
                <small>For the confirmed payment</small>
              </span>
            </Link>
          )}
          <Link href={`/admin/documents/orders/${encodeURIComponent(order.id)}/invoice`} target="_blank">
            <Icon name="orders" />
            <span>
              <b>Invoice</b>
              <small>{order.payment?.paidAt ? "Shows the order as paid" : `Requests ${money(outstanding)}`}</small>
            </span>
          </Link>
        </div>
      </section>

      <section className="op-card no-print">
        <h3>Internal note</h3>
        <Textarea
          label="Only administrators can see this"
          rows={3}
          placeholder="Anything the team should know about this order"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button disabled={busy || note === order.internalNote} variant="secondary" onClick={saveNote}>
          Save note
        </Button>
      </section>

      {!!order.events.length && (
        <section className="op-card">
          <h3>Activity</h3>
          <ol className="op-timeline">
            {order.events.map((event) => (
              <li key={event.id} className={event.eventType === "EMAIL_FAILED" ? "is-problem" : ""}>
                <b>{describeEvent(event)}</b>
                {event.note && <p>{event.note}</p>}
                <small>
                  {ago(event.createdAt)} · {when(event.createdAt)}
                </small>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
