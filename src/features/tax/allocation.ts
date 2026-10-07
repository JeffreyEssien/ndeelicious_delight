/** Largest remainder allocation; stable input order breaks ties, cents sum exactly. */
export function allocateDiscount(
  amount: number,
  lines: { grossAmount: number; discountEligible: boolean }[],
): number[] {
  const eligible = lines.reduce((sum, line) => sum + (line.discountEligible ? line.grossAmount : 0), 0);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > eligible ||
    lines.some((line) => !Number.isSafeInteger(line.grossAmount) || line.grossAmount < 0)
  )
    throw new Error("Invalid discount allocation.");
  if (!amount) return lines.map(() => 0);
  const shares = lines.map((line, index) => {
    const numerator = BigInt(amount) * BigInt(line.discountEligible ? line.grossAmount : 0);
    return { index, value: Number(numerator / BigInt(eligible)), remainder: numerator % BigInt(eligible) };
  });
  let remaining = amount - shares.reduce((sum, share) => sum + share.value, 0);
  for (const share of [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (!remaining) break;
    share.value++;
    remaining--;
  }
  return shares.map((share) => share.value);
}
