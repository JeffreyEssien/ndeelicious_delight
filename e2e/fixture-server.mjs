// Isolated public storefront fixture: no remote credentials or network access.
import http from "node:http";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { products as seedProducts } from "../scripts/catalog-seed-data.mjs";
const sql = fs.readFileSync(new URL("../db/migrations/0006_database_backed_storefront.sql", import.meta.url), "utf8");
const content = JSON.parse(sql.match(/\$content\$([\s\S]*?)\$content\$/)[1]);
const business = {
  businessName: "Ndeelicious Delight",
  contactEmail: "",
  phone: "",
  whatsapp: "",
  address: "Halifax",
  city: "Halifax",
  country: "CA",
  province: "NS",
  postalCode: "B3J 1A1",
  locale: "en-CA",
  timezone: "America/Halifax",
  openingHours: "",
  currency: "CAD",
  cakeLeadHours: 72,
  instagramUrl: "",
  deliveryEnabled: false,
  pickupEnabled: true,
  orderMinimum: 0,
  taxEnabled: true,
  taxLabel: "HST",
  taxRateBps: 1400,
  taxDelivery: true,
};
const id = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const cakeTypes = [
  {
    id: id(91),
    name: "Wedding Cake",
    slug: "wedding-cake",
    description: "A celebration made for your wedding.",
    lead_time_value: 3,
    lead_time_unit: "weeks",
    active: true,
    sort_order: 0,
    image: "/custom-cake.jpg",
    customer_notice: "Allow at least 3 weeks.",
  },
  {
    id: id(92),
    name: "Birthday Cake",
    slug: "birthday-cake",
    description: "For birthdays big and small.",
    lead_time_value: 1,
    lead_time_unit: "weeks",
    active: true,
    sort_order: 1,
    image: "/custom-cake.jpg",
    customer_notice: "",
  },
];
const products = seedProducts.slice(0, 8).map((p, i) => ({
  ...p,
  id: id(i + 1),
  base_price: Math.round(p.price / 1000),
  discount_price: null,
  short_description: p.shortDescription,
  track_inventory: i !== 1,
  stock_quantity: p.stockQuantity,
  low_stock_threshold: p.lowStockThreshold,
  shopping_mode: p.category === "READY_TO_BAKE" ? "READY_TO_BAKE" : i === 1 ? "MADE_TO_ORDER" : "READY_TO_ORDER",
  preparation_hours: i === 1 ? 48 : 0,
  categories: {
    id: id(50),
    slug:
      p.category === "READY_TO_BAKE" ? "ready-to-bake" : p.category === "CUSTOM_CAKES" ? "custom-cakes" : "pastries",
  },
  product_variants: (i === 1
    ? [
        { name: "Pack of 3", priceAdjustment: 0 },
        { name: "Pack of 6", priceAdjustment: 1200 },
        { name: "Pack of 12", priceAdjustment: 3500 },
      ]
    : p.variants
  ).map((v, j) => ({
    id: id(100 + i * 10 + j),
    name: v.name,
    sku: `FIXTURE-${i}-${j}`,
    price_adjustment: i === 1 ? v.priceAdjustment : Math.round(v.priceAdjustment / 1000),
    stock_quantity: i === 1 ? 0 : v.stockQuantity,
    active: true,
  })),
  product_images: [{ id: id(500 + i), url: p.image, alt_text: p.name, sort_order: 0, storage_path: null }],
  ingredients: p.ingredients,
  allergens: p.allergens,
  storage_instructions: p.storageInstructions ?? "",
  preparation_instructions:
    p.category === "READY_TO_BAKE" ? "Keep frozen. Follow the supplied baking instructions." : "",
}));
products[1].base_price = 1500;
const cakeOptions = ["occasion", "size", "flavour", "filling", "design"].map((type, i) => ({
  id: id(800 + i),
  type,
  name: ["Birthday", "6 inch", "Vanilla", "Buttercream", "Classic finish"][i],
  description: "",
  price_adjustment: i === 1 ? 6800 : 0,
  quote_required: false,
  active: true,
  sort_order: 0,
}));
const settings = [
  { key: "business", value: business },
  { key: "content", value: content },
  { key: "theme", value: "berry" },
];
const fixtureSecret = "isolated-ndee-browser-secret-32-characters";
const hash = (value) => createHmac("sha256", fixtureSecret).update(value).digest("hex");
const adminId = id(999);
const tables = {
  site_settings: settings,
  products,
  cake_types: cakeTypes,
  custom_cake_options: cakeOptions,
  categories: [
    { id: id(50), slug: "custom-cakes", name: "Custom cakes" },
    { id: id(51), slug: "pastries", name: "Pastries" },
    { id: id(52), slug: "ready-to-bake", name: "Ready to bake" },
  ],
  product_variants: products.flatMap((p) => p.product_variants.map((v) => ({ ...v, product_id: p.id }))),
  product_images: products.flatMap((p) => p.product_images.map((image) => ({ ...image, product_id: p.id }))),
  admins: [{ id: adminId, name: "Fixture Owner", email: "owner@example.invalid", role: "OWNER", active: true }],
  admin_sessions: [
    {
      id: id(998),
      admin_id: adminId,
      token_hash: hash("session:fixture-token"),
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: null,
    },
  ],
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const table = url.pathname.split("/").pop();
  let body = "";
  for await (const chunk of req) body += chunk;
  const respond = (status, value) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/__fixtures/reset-cake-types" && req.method === "POST") {
    tables.cake_types.length = 0;
    respond(200, {});
    return;
  }
  if (!url.pathname.startsWith("/rest/v1/")) {
    respond(404, {});
    return;
  }
  const filter = (row) =>
    [...url.searchParams].every(([key, value]) => {
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("gt.")) return String(row[key]) > value.slice(3);
      return true;
    });
  if (url.pathname.includes("/rpc/")) {
    respond(200, id(997));
    return;
  }
  if (table === "products")
    products.forEach((p) => {
      p.product_variants = tables.product_variants.filter((v) => v.product_id === p.id);
      p.product_images = tables.product_images.filter((image) => image.product_id === p.id);
    });
  const all = tables[table] ?? [];
  let rows = all.filter(filter);
  if (req.method === "PATCH") {
    const patch = JSON.parse(body);
    rows.forEach((row) => {
      Object.assign(row, patch);
    });
  }
  if (req.method === "POST") {
    const values = JSON.parse(body);
    rows = (Array.isArray(values) ? values : [values]).map((value) => {
      let row = all.find((row) => row.id === value.id && value.id);
      if (row) Object.assign(row, value);
      else {
        row = { id: id(1000 + all.length), ...value };
        all.push(row);
      }
      return row;
    });
    tables[table] = all;
  }
  const single = req.headers.accept?.includes("application/vnd.pgrst.object+json");
  respond(200, single ? (rows[0] ?? null) : rows);
});
server.listen(4545, "127.0.0.1", () => console.log("Isolated storefront fixtures on 4545 (local sample data only)"));
