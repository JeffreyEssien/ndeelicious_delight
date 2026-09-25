export function formatMoney(minorUnits: number, currency = "CAD", locale = "en-CA") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorUnits / 100);
}

export function formatDate(date: string | Date, locale = "en-CA", timezone = "America/Toronto") {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new RangeError("Invalid date");
  const dateOnly = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: dateOnly ? "UTC" : timezone }).format(value);
}
