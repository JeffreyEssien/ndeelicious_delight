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
  deliveryTaxMode: "SEPARATE_TAXABLE_SERVICE",
  fulfilmentSchedule: {
    timezone: "America/Halifax",
    deliveryDays: [0, 1, 2, 3, 4, 5, 6],
    sameDayEnabled: false,
    sameDayCutoff: "12:00",
    defaultEstimate: "Next available day",
    blackouts: [],
    pickupEnabled: true,
    pickupAddress: "Fixture bakery, Halifax",
    pickupInstructions: "Bring your order number.",
    pickupDays: [0, 1, 2, 3, 4, 5, 6],
    pickupHours: { start: "09:00", end: "17:00" },
    pickupPreparationBufferHours: 0,
  },
};
const id = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const cakeTypes = [
  {
    id: id(91),
    name: "Wedding Cake",
    slug: "wedding-cake",
    description: "A celebration made for your wedding.",
    base_price: 200,
    tax_class: "FULL_CAKE",
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
    base_price: 200,
    tax_class: "FULL_CAKE",
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
  tax_class: i === 1 ? "SWEET_SINGLE_SERVING" : "STANDARD_TAXABLE",
  categories: {
    id: id(50),
    slug:
      p.category === "READY_TO_BAKE" ? "ready-to-bake" : p.category === "CUSTOM_CAKES" ? "custom-cakes" : "pastries",
  },
  product_variants: (i === 1
    ? [
        { name: "Pack of 3", priceAdjustment: 0, packQuantity: 3 },
        { name: "Pack of 6", priceAdjustment: 1200, packQuantity: 6 },
        { name: "Pack of 12", priceAdjustment: 3500, packQuantity: 12 },
      ]
    : p.variants
  ).map((v, j) => ({
    id: id(100 + i * 10 + j),
    name: v.name,
    pack_quantity: v.packQuantity ?? null,
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
  cake_type_options: cakeTypes.flatMap((type) =>
    cakeOptions.map((option) => ({ cake_type_id: type.id, option_id: option.id })),
  ),
  delivery_zones: [],
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
const initialTables = structuredClone(tables);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const table = url.pathname.split("/").pop();
  let body = "";
  for await (const chunk of req) body += chunk;
  const respond = (status, value) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/__fixtures/reset" && req.method === "POST") {
    for (const key of Object.keys(tables)) tables[key] = structuredClone(initialTables[key] ?? []);
    respond(200, {});
    return;
  }
  if (url.pathname === "/__fixtures/reset-delivery-areas" && req.method === "POST") {
    tables.delivery_zones.length = 0;
    respond(200, {});
    return;
  }
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
    const args = body ? JSON.parse(body) : {};
    if (table === "consume_public_rate_limit") {
      respond(200, { allowed: true, retry_after: 1 });
      return;
    }
    if (table === "save_cake_configuration") {
      for (const type of args.p_types) {
        const values = {
          id: type.id,
          name: type.name,
          slug: type.slug,
          description: type.description,
          base_price: type.basePrice,
          tax_class: type.taxClass,
          lead_time_value: type.leadTimeValue,
          lead_time_unit: type.leadTimeUnit,
          active: type.active,
          sort_order: type.sortOrder,
          image: type.image,
          customer_notice: type.customerNotice,
        };
        const row = tables.cake_types.find((item) => item.id === type.id);
        if (row) Object.assign(row, values);
        else tables.cake_types.push(values);
      }
      if (args.p_assignments)
        tables.cake_type_options = args.p_assignments.map((link) => ({
          cake_type_id: link.cakeTypeId,
          option_id: link.optionId,
        }));
    }
    if (table === "save_delivery_areas")
      tables.delivery_zones = args.p_areas.map((area) => ({
        id: area.id,
        name: area.name,
        fee: area.fee,
        minimum_order: area.minimumOrder,
        estimated_time: area.estimate,
        active: area.active,
        sort_order: area.sortOrder,
        postal_code_prefixes: area.postalCodePrefixes,
        free_delivery_threshold: area.freeDeliveryThreshold,
        customer_note: area.customerNote,
        same_day_eligible: area.sameDayEligible,
      }));
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
      let row = all.find((row) =>
        table === "site_settings" ? row.key === value.key : row.id === value.id && value.id,
      );
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
