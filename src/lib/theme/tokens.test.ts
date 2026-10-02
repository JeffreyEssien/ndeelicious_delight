import { describe, expect, it } from "vitest";
import { defaultStoreAppearance } from "@/lib/data/settings";
import { contrastRatio, resolveThemeTokens, themeTokenCss, type StoreTheme } from "./tokens";

describe("theme token resolver", () => {
  it.each(["berry", "purple", "sunrise"] satisfies StoreTheme[])("returns complete %s tokens", (theme) => {
    const tokens = resolveThemeTokens(theme, defaultStoreAppearance);
    expect(Object.keys(tokens)).toHaveLength(22);
    expect(Object.values(tokens).every(Boolean)).toBe(true);
    expect(Object.keys(themeTokenCss(tokens))).toHaveLength(23);
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

  it.each(["berry", "purple", "sunrise"] satisfies StoreTheme[])(
    "keeps every text-bearing %s colour pair accessible",
    (theme) => {
      const tokens = resolveThemeTokens(theme, defaultStoreAppearance);
      for (const [background, foreground] of [
        [tokens.primary, tokens.onPrimary],
        [tokens.primaryHover, tokens.onPrimary],
        [tokens.accent, tokens.onAccent],
        [tokens.background, tokens.text],
        [tokens.background, tokens.textMuted],
        [tokens.surface, tokens.text],
        [tokens.surface, tokens.textMuted],
        [tokens.featureSurface, tokens.featureText],
        [tokens.featureSurface, tokens.featureMuted],
        [tokens.featureHighlight, tokens.onFeatureHighlight],
      ]) {
        expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("repairs unsafe owner-selected text colours", () => {
    const tokens = resolveThemeTokens("berry", {
      ...defaultStoreAppearance,
      useCustomColors: true,
      colors: {
        background: "#ffffff",
        surface: "#fffdfb",
        text: "#f8f8f8",
        mutedText: "#eeeeee",
        primary: "#ed5b22",
        primaryDark: "#f47f52",
        accent: "#fff000",
      },
    });
    expect(contrastRatio(tokens.background, tokens.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.background, tokens.textMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.surface, tokens.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.surface, tokens.textMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.primaryHover, tokens.onPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.background, tokens.focus)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(tokens.surface, tokens.focus)).toBeGreaterThanOrEqual(3);
  });

  it("repairs an owner-selected surface that cannot share readable text with the page", () => {
    const tokens = resolveThemeTokens("berry", {
      ...defaultStoreAppearance,
      useCustomColors: true,
      colors: {
        ...defaultStoreAppearance.colors,
        background: "#000000",
        surface: "#ffffff",
        text: "#ffffff",
        mutedText: "#cccccc",
      },
    });
    expect(contrastRatio(tokens.background, tokens.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.surface, tokens.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.background, tokens.textMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.surface, tokens.textMuted)).toBeGreaterThanOrEqual(4.5);
  });
});
