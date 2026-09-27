import { describe, expect, it } from "vitest";
import { defaultStoreAppearance } from "@/lib/data/settings";
import { contrastRatio, resolveThemeTokens, themeTokenCss, type StoreTheme } from "./tokens";

describe("theme token resolver", () => {
  it.each(["berry", "purple", "sunrise"] satisfies StoreTheme[])("returns complete %s tokens", (theme) => {
    const tokens = resolveThemeTokens(theme, defaultStoreAppearance);
    expect(Object.keys(tokens)).toHaveLength(20);
    expect(Object.values(tokens).every(Boolean)).toBe(true);
    expect(Object.keys(themeTokenCss(tokens))).toHaveLength(21);
  });

  it("resolves every semantic token from an unusual custom theme", () => {
    const tokens = resolveThemeTokens("berry", {
      ...defaultStoreAppearance,
      useCustomColors: true,
      colors: {
        background: "#071e22",
        surface: "#102f36",
        text: "#f7fffb",
        mutedText: "#b5cbc5",
        primary: "#d7ff00",
        primaryDark: "#a7c600",
        accent: "#ff4fc8",
      },
    });
    expect(tokens.background).toBe("#071e22");
    expect(tokens.primaryHover).toBe("#a7c600");
    expect(tokens.onPrimary).toBe("#17120f");
    expect(tokens.featureSurface).toBe(tokens.primary);
  });

  it("automatically chooses accessible primary and accent foregrounds", () => {
    for (const background of ["#6516a3", "#f4c430", "#111111", "#fefefe"]) {
      const foreground = resolveThemeTokens("berry", {
        ...defaultStoreAppearance,
        useCustomColors: true,
        colors: { ...defaultStoreAppearance.colors, primary: background, accent: background },
      }).onPrimary;
      expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
