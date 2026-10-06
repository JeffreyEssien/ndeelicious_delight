import { describe, expect, it, vi } from "vitest";
import { customerText, defaultCustomerText, mergeCustomerText } from "@/content/customer-text";
import { escapeHtml, emailFrame } from "@/lib/email/mailer";
vi.mock("@/lib/data/settings", () => ({
  getStorefrontContent: async () => ({ customerText: { emails: { "Made with care.": "Baked for you.", "Hello {name},": "Welcome {name}!" } } }),
  getBusinessSettings: async () => ({ businessName: "Owner's bakery" }),
}));
import { getCustomerEmailText } from "./customer-text";

describe("owner-managed customer wording", () => {
  it("preserves existing edits while supplying newly introduced fields", () => {
    const copy = mergeCustomerText({ footer: { Shop: "Browse our bakery" } });
    expect(copy.footer.Shop).toBe("Browse our bakery");
    expect(copy.emails["Payment confirmed"]).toBe(defaultCustomerText.emails["Payment confirmed"]);
    expect(defaultCustomerText.footer.Shop).not.toBe("Browse our bakery");
  });
  it("interpolates values literally and preserves unfilled placeholders", () => {
    const t = customerText({ emails: { "Hello {name},": "Hi {name}, order {number}" } }, "emails");
    expect(t("Hello {name},", { name: "$& <Sam>" })).toBe("Hi $& <Sam>, order {number}");
    expect(t("Unchanged fallback")).toBe("Unchanged fallback");
    expect(t(undefined)).toBe("");
  });
  it("uses central error edits in every screen", () => {
    const t = customerText({ errors: { "Document not found.": "Please request a new link." } }, "quote response");
    expect(t("Document not found.")).toBe("Please request a new link.");
  });
  it("uses saved email wording and escapes owner text and customer values", async () => {
    const { t, frame } = await getCustomerEmailText();
    const html = emailFrame("<Title>", `<p>${escapeHtml(t("Hello {name},", { name: "<script>" }))}</p>`, frame);
    expect(html).toContain("Welcome &lt;script&gt;!");
    expect(html).toContain("Owner&#39;s bakery");
    expect(html).toContain("Baked for you.");
    expect(html).not.toContain("<script>");
  });
});
