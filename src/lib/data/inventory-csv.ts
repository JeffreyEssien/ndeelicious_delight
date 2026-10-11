export type InventoryImportRow = {
  productName?: string;
  variantName?: string;
  sku?: string;
  productId: string;
  variantId: string;
  expected: number;
  mode: "add" | "remove" | "set";
  quantity: number;
};
export function parseInventoryCsv(text: string): InventoryImportRow[] {
  if (text.length > 200000) throw new Error("Choose a CSV smaller than 200 KB.");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (char === "\n") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else value += char;
  }
  if (quoted) throw new Error("CSV contains an unfinished quoted value.");
  row.push(value.replace(/\r$/, ""));
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim());
  const names = ["productId", "variantId", "expected", "mode", "quantity"];
  if (!header || names.some((name) => !header.includes(name)))
    throw new Error("Use the exported inventory CSV and keep its column names.");
  if (!rows.length || rows.length > 100) throw new Error("Import 1–100 variants at a time.");
  const ids = new Set<string>();
  return rows.map((row, index) => {
    const item = Object.fromEntries(names.map((name) => [name, row[header.indexOf(name)]?.trim()]));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !uuid.test(item.productId ?? "") ||
      !uuid.test(item.variantId ?? "") ||
      ids.has(item.variantId) ||
      !["add", "remove", "set"].includes(item.mode) ||
      !/^\d+$/.test(item.expected ?? "") ||
      !/^\d+$/.test(item.quantity ?? "") ||
      Number(item.expected) > 2147483647 ||
      Number(item.quantity) > 2147483647
    )
      throw new Error(`Check IDs, mode and whole quantities on CSV row ${index + 2}. Each variant must appear once.`);
    ids.add(item.variantId);
    return {
      productName: row[header.indexOf("product")]?.trim(),
      variantName: row[header.indexOf("variant")]?.trim(),
      sku: row[header.indexOf("sku")]?.trim(),
      productId: item.productId,
      variantId: item.variantId,
      mode: item.mode as InventoryImportRow["mode"],
      expected: Number(item.expected),
      quantity: Number(item.quantity),
    };
  });
}
