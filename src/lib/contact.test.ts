import { describe, expect, it } from "vitest";
import { whatsappUrl } from "./contact";
describe("owner-managed WhatsApp links", () => {
  it("supports an international number or a supplied WhatsApp link", () => {
    expect(whatsappUrl("+1 (902) 555-1234")).toBe("https://wa.me/19025551234");
    expect(whatsappUrl("https://wa.me/19025551234")).toBe("https://wa.me/19025551234");
  });
  it("does not turn unrelated URLs or incomplete numbers into contact links", () => {
    expect(whatsappUrl("https://evil.example/19025551234")).toBe("");
    expect(whatsappUrl("123")).toBe("");
    expect(whatsappUrl("")).toBe("");
  });
});
