import { describe, expect, it } from "vitest";
import { themeFromPixels } from "./promo-theme";

const pixels = (...colours: [number, number, number][]) => colours.flatMap(([r, g, b]) => [r, g, b, 255]);
const hueOf = (colour: string) => Number(/hsl\((\d+)/.exec(colour)?.[1]);
const lightnessOf = (colour: string) => Number(/(\d+)%\)$/.exec(colour)?.[1]);

describe("promo theme from image pixels", () => {
  it("follows the image's strongest colour family", () => {
    const red = themeFromPixels(pixels([200, 30, 40], [220, 50, 50], [250, 250, 250], [20, 20, 20]));
    expect(hueOf(red.glow) < 15 || hueOf(red.glow) > 345).toBe(true);
    const green = themeFromPixels(pixels([40, 200, 90], [30, 180, 70], [200, 40, 40]));
    expect(hueOf(green.glow)).toBeGreaterThan(100);
    expect(hueOf(green.glow)).toBeLessThan(160);
  });

  it("keeps the background dark enough for light text", () => {
    const theme = themeFromPixels(pixels([255, 230, 120], [250, 220, 100]));
    expect(lightnessOf(theme.background)).toBeLessThanOrEqual(12);
    expect(lightnessOf(theme.accent)).toBeGreaterThanOrEqual(80);
  });

  it("stays neutral for greyscale or empty images", () => {
    expect(themeFromPixels(pixels([120, 120, 120], [30, 30, 30])).background).toBe("hsl(0 0% 10%)");
    expect(themeFromPixels([]).background).toBe("hsl(0 0% 10%)");
  });

  it("ignores transparent pixels", () => {
    const theme = themeFromPixels([200, 30, 40, 0, 40, 200, 90, 255]);
    expect(hueOf(theme.glow)).toBeGreaterThan(100);
  });
});
