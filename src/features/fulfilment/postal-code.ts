/** Canadian postal codes exclude D, F, I, O, Q and U; W/Z cannot lead. */
const pattern = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ]\d[ABCEGHJ-NPRSTVWXYZ]\d$/;
export function normalizeCanadianPostalCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/\s/g, "");
  return pattern.test(compact) ? `${compact.slice(0, 3)} ${compact.slice(3)}` : null;
}
export function postalFsa(value: string): string | null {
  return normalizeCanadianPostalCode(value)?.slice(0, 3) ?? null;
}
