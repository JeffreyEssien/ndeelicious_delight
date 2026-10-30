/** An order still inside the notice customers were given before it can be ready. */
export type EarlyOrder = { number: string; placedAt: string; readyAt: string };

export function isEarly(readyAt: string | null | undefined, now = Date.now()) {
  return Boolean(readyAt && new Date(readyAt).getTime() > now);
}

// "24-hour" for most orders; longer when a product or cake needs more preparation.
const noticeHours = (order: EarlyOrder) =>
  Math.round((new Date(order.readyAt).getTime() - new Date(order.placedAt).getTime()) / 3_600_000);

/** The reminder shown before marking an order ready while its notice period is still running. */
export function earlyReadyMessage(orders: EarlyOrder[], locale = "en-CA", timezone = "America/Halifax") {
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(
      new Date(iso),
    );
  if (orders.length === 1) {
    const [order] = orders;
    return `${order.number} is still inside its ${noticeHours(order)}-hour notice period. It ends ${time(order.readyAt)}.\n\nMark it ready anyway?`;
  }
  const lines = orders.map((order) => `${order.number}: ${noticeHours(order)}-hour notice ends ${time(order.readyAt)}`);
  return `These orders are still inside their notice period:\n${lines.join("\n")}\n\nMark them ready anyway?`;
}
