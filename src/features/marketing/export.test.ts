import { describe, expect, it } from "vitest";
import { marketingCaption, marketingFilename, marketingFormats, selectedMarketingProducts } from "./export";

describe("marketing exports", () => {
  it("uses the exact supported social dimensions", () => {
    expect(marketingFormats.square).toMatchObject({ width: 1080, height: 1080 });
    expect(marketingFormats.portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(marketingFormats.story).toMatchObject({ width: 1080, height: 1920 });
  });

  it("builds stable filenames and deterministic captions", () => {
    expect(marketingFilename("Berry & Cream Cake", "story")).toBe("berry-cream-cake-story.png");
    const product = { slug: "berry-cake", name: "Berry Cake", shortDescription: "Fresh berries" } as never;
    expect(marketingCaption(product, "$45.00", "https://example.ca/", "Order online")).toContain(
      "https://example.ca/product/berry-cake",
    );
  });

  it("selects active products independently of a homepage carousel", () => {
    const products = [
      { id: "one", status: "ACTIVE" },
      { id: "two", status: "DRAFT" },
      { id: "three", status: "ACTIVE" },
    ] as never;
    expect(selectedMarketingProducts(products, ["three", "two"])).toEqual([{ id: "three", status: "ACTIVE" }]);
  });
});
