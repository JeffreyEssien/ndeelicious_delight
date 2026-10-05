import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import pg from "pg";
import { businessSettingsSchema, storefrontContentSchema } from "../src/validations/settings.ts";

const directory = new URL("../docs/merchant-center/", import.meta.url);
const copy = JSON.parse(await readFile(new URL("policy-copy.json", directory), "utf8"));
const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
for (const document of copy.documents) {
  const markdown = `# ${copy.businessName} — ${document.title}\n\nUpdated: ${copy.updated}\n\n${document.sections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}\n`;
  await writeFile(new URL(`${document.slug}.md`, directory), markdown);
}
const html = `<!doctype html><html lang="en-CA"><head><meta charset="utf-8"><title>${escapeHtml(copy.businessName)} — Business policies</title><style>
@page{size:A4;margin:20mm}body{font:11pt/1.55 Arial,sans-serif;color:#222;max-width:820px;margin:30px auto;padding:0 20px}h1{font-size:22pt;line-height:1.2}h2{font-size:13pt;break-after:avoid}p{orphans:3;widows:3;overflow-wrap:anywhere}article+article{break-before:page}.date{color:#555}header{border-bottom:2px solid #792f49;padding-bottom:12px} @media print{body{margin:0;padding:0}}
</style></head><body>${copy.documents.map((document) => `<article><header><p>${escapeHtml(copy.businessName)} · ${escapeHtml(copy.location)}</p><h1>${escapeHtml(document.title)}</h1><p class="date">Updated: ${escapeHtml(copy.updated)}</p></header>${document.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`).join("")}</article>`).join("")}</body></html>`;
await writeFile(new URL("business-policies.html", directory), html);
if (process.argv.includes("--pdf")) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.pdf({
      path: fileURLToPath(new URL("business-policies.pdf", directory)),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

if (process.argv.includes("--apply")) {
  if (process.env.POLICY_CONTENT_UPDATE_AUTHORIZED !== "true")
    throw new Error("Policy settings update requires explicit authorization.");
  const client = new pg.Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: process.env.DATABASE_TEST_ALLOW_SELF_SIGNED !== "true" },
  });
  try {
    await client.connect();
    await client.query("begin");
    await client.query("set local lock_timeout='5s'");
    const rows = (
      await client.query("select key,value from public.site_settings where key in ('business','content') for update")
    ).rows;
    const business = rows.find((row) => row.key === "business")?.value;
    const content = rows.find((row) => row.key === "content")?.value;
    if (!business || !content) throw new Error("Existing business and content settings are required.");
    if (
      business.businessName !== copy.businessName ||
      business.contactEmail !== copy.contactEmail ||
      business.phone !== copy.phone
    ) {
      throw new Error("Public contact details changed; regenerate policy copy before applying.");
    }
    const backup = `/private/tmp/ndee-policies-before-${Date.now()}.json`;
    await writeFile(backup, JSON.stringify(rows), { mode: 0o600 });
    Object.assign(business, { city: "Halifax", province: "NS", timezone: "America/Halifax" });
    const policy = (slug) => {
      const document = copy.documents.find((item) => item.slug === slug);
      return { title: document.title, eyebrow: "Last updated", updated: copy.updated, sections: document.sections };
    };
    content.policies.refund = policy("returns-refunds-cancellations");
    content.policies.terms = policy("terms-of-service");
    content.policies.privacy = policy("privacy-policy");
    content.global.footerDescription = `${copy.businessDescription} Based in ${copy.location}.`;
    content.home.hero.eyebrow = "Handmade in Halifax, Nova Scotia";
    content.home.hero.supportingText =
      "Custom cakes and frozen, ready-to-bake Nigerian-style meat pies, chicken pies and beef sausage rolls, made in Halifax, Nova Scotia, Canada.";
    content.home.intro.body =
      "Custom cakes for your celebrations and frozen Nigerian-style meat pies, chicken pies and beef sausage rolls ready to bake at home. Food Safety & Handler Certified.";
    content.about.hero.supportingText = `${copy.businessName} is based in ${copy.location}, offering custom cakes and frozen, ready-to-bake Nigerian-style meat pies, chicken pies and beef sausage rolls.`;
    content.about.story.paragraphs = [
      "Based in Halifax, Nova Scotia, Canada, we make custom cakes for your celebrations and Nigerian-style meat pies, chicken pies and beef sausage rolls for you to enjoy at home.",
      "Our frozen, ready-to-bake pies let you enjoy a freshly baked favourite when it suits you. Follow the product's preparation and storage instructions.",
      "Food Safety & Handler Certified.",
    ];
    content.contact.hero.supportingText = `Custom cakes and frozen, ready-to-bake Nigerian-style meat pies, chicken pies and beef sausage rolls in ${copy.location}. Contact us for order support, cake enquiries and collection arrangements.`;
    content.customCakes.hero.eyebrow = "Custom cakes in Halifax, Nova Scotia";
    content.readyToBake.hero.eyebrow = "Nigerian-style favourites, ready to bake";
    content.readyToBake.hero.headline = "From your freezer.\nFresh from your oven.";
    content.readyToBake.hero.supportingText =
      "Frozen, ready-to-bake Nigerian-style meat pies, chicken pies and beef sausage rolls, available at selected stores across Halifax HRM. Follow the instructions supplied with each product.";
    content.readyToBake.stockists = copy.stockists;
    content.about.story.paragraphs.push(
      "Find our meat pies, chicken pies and beef sausage rolls at selected stores across Halifax HRM. Contact each stockist for current availability.",
    );
    content.readyToBake.steps = [
      { title: "Store safely", body: "Follow the storage instructions supplied with your frozen pies." },
      {
        title: "Prepare & bake",
        body: "Follow your product's preparation, oven temperature and cooking-time instructions.",
      },
      { title: "Enjoy", body: "Handle and serve according to the food-safety instructions supplied with the product." },
    ];
    const delivery = copy.documents.find((item) => item.slug === "delivery-and-pickup");
    content.delivery.hero.supportingText =
      "Delivery and pickup arrangements for our Halifax, Nova Scotia bakery. Review available options, fees and dates before paying.";
    content.delivery.intro.body = delivery.sections[0].body;
    content.delivery.steps = delivery.sections
      .slice(1, 3)
      .concat(delivery.sections.slice(4, 7))
      .map((section) => ({ title: section.heading, body: section.body }));
    content.delivery.pickup.body = delivery.sections.find((section) => section.heading === "Pickup").body;
    const ordering = content.faq.groups.find((group) => group.title === "Ordering");
    if (ordering) {
      ordering.questions = ordering.questions.filter(
        (question) => !["Can I cancel a cake order?", "Are cake payments refundable?"].includes(question.question),
      );
      ordering.questions.push(
        {
          question: "Can I cancel a cake order?",
          answer:
            "Wedding cakes require at least one calendar month's written notice; other cakes require one week (seven days), before the scheduled delivery or collection date. Email us or use the contact form. Read /refund-policy for the full rules.",
        },
        {
          question: "Are cake payments refundable?",
          answer:
            "Cake payments already made are non-refundable for customer cancellation or change of mind, even when the required notice is given. This does not exclude mandatory consumer rights. This cake rule does not set the refund policy for non-cake products.",
        },
      );
    }
    businessSettingsSchema.parse(business);
    storefrontContentSchema.parse(content);
    for (const [key, value] of [
      ["business", business],
      ["content", content],
    ]) {
      await client.query("update public.site_settings set value=$1::jsonb,updated_at=now() where key=$2", [
        JSON.stringify(value),
        key,
      ]);
    }
    await client.query("commit");
    console.log(`Updated only business/content settings. Previous public settings backup: ${backup}`);
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
console.log("Merchant policy documents generated from policy-copy.json.");
