export function formatMoney(kobo: number) {
  const roundedNaira = Math.round(Math.abs(kobo) / 100);
  const grouped = String(roundedNaira).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${kobo < 0 ? "−" : ""}₦${grouped}`;
}

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatDate(date: string | Date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date");
  return `${value.getUTCDate()} ${shortMonths[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}
