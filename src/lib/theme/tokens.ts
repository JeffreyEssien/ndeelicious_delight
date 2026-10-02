import type { StoreAppearance } from "@/types/content";

export type StoreTheme = "berry" | "purple" | "sunrise";

export type ThemeTokens = {
  background: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  focus: string;
  success: string;
  warning: string;
  danger: string;
  featureSurface: string;
  featureText: string;
  featureMuted: string;
  featureHighlight: string;
  onFeatureHighlight: string;
};

type Rgb = { red: number; green: number; blue: number };

const presets: Record<
  StoreTheme,
  Pick<ThemeTokens, "background" | "surface" | "text" | "textMuted" | "border" | "primary" | "accent">
> = {
  berry: {
    background: "#faf8f5",
    surface: "#ffffff",
    text: "#211c19",
    textMuted: "#706965",
    border: "#e5dfd9",
    primary: "#792f49",
    accent: "#c89b49",
  },
  purple: {
    background: "#fbf8ff",
    surface: "#ffffff",
    text: "#291733",
    textMuted: "#75677d",
    border: "#e5dbee",
    primary: "#6516a3",
    accent: "#c58b20",
  },
  sunrise: {
    background: "#fffaf2",
    surface: "#ffffff",
    text: "#3d230d",
    textMuted: "#7b6858",
    border: "#eedfc9",
    primary: "#ed5b22",
    accent: "#e8b915",
  },
};

export function parseHexColor(value: string): Rgb {
  const normalized = value.trim().replace(/^#/, "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid hex colour: ${value}`);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function toHex({ red, green, blue }: Rgb) {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function mixColors(first: string, second: string, secondWeight: number) {
  const a = parseHexColor(first);
  const b = parseHexColor(second);
  const weight = Math.max(0, Math.min(1, secondWeight));
  return toHex({
    red: a.red * (1 - weight) + b.red * weight,
    green: a.green * (1 - weight) + b.green * weight,
    blue: a.blue * (1 - weight) + b.blue * weight,
  });
}

export function relativeLuminance(color: string) {
  const rgb = parseHexColor(color);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.red) + 0.7152 * channel(rgb.green) + 0.0722 * channel(rgb.blue);
}

export function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastSafeForeground(background: string) {
  const light = "#ffffff";
  const dark = "#17120f";
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

export function ensureReadableForeground(background: string, preferred: string, minimum = 4.5) {
  return contrastRatio(background, preferred) >= minimum ? preferred : contrastSafeForeground(background);
}

function readableAcross(backgrounds: string[], preferred: string, minimum = 4.5) {
  if (backgrounds.every((background) => contrastRatio(background, preferred) >= minimum)) return preferred;
  return ["#17120f", "#ffffff"].sort(
    (first, second) =>
      Math.min(...backgrounds.map((background) => contrastRatio(background, second))) -
      Math.min(...backgrounds.map((background) => contrastRatio(background, first))),
  )[0];
}

function surfaceCompatibleWithText(requested: string, background: string, text: string) {
  if (contrastRatio(requested, text) >= 4.5) return requested;
  for (const backgroundWeight of [0.2, 0.4, 0.6, 0.8, 1]) {
    const candidate = mixColors(requested, background, backgroundWeight);
    if (contrastRatio(candidate, text) >= 4.5) return candidate;
  }
  return background;
}

function readableMuted(backgrounds: string[], preferred: string, text: string) {
  if (backgrounds.every((background) => contrastRatio(background, preferred) >= 4.5)) return preferred;
  for (const weight of [0.82, 0.9, 1]) {
    const candidate = mixColors(backgrounds[0], text, weight);
    if (backgrounds.every((background) => contrastRatio(background, candidate) >= 4.5)) return candidate;
  }
  return readableAcross(backgrounds, text);
}

function accessibleHover(primary: string, requested: string, foreground: string) {
  if (contrastRatio(requested, foreground) >= 4.5) return requested;
  const destination = foreground === "#ffffff" ? "#000000" : "#ffffff";
  for (const weight of [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84]) {
    const candidate = mixColors(primary, destination, weight);
    if (contrastRatio(candidate, foreground) >= 4.5) return candidate;
  }
  return primary;
}

export function colorWithAlpha(color: string, alpha: number) {
  const rgb = parseHexColor(color);
  return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function resolveThemeTokens(theme: StoreTheme, appearance: StoreAppearance): ThemeTokens {
  const selected = appearance.useCustomColors
    ? {
        background: appearance.colors.background,
        surface: appearance.colors.surface,
        text: appearance.colors.text,
        textMuted: appearance.colors.mutedText,
        border: mixColors(appearance.colors.background, appearance.colors.text, 0.14),
        primary: appearance.colors.primary,
        accent: appearance.colors.accent,
      }
    : presets[theme];
  const requestedSurfaces = [selected.background, selected.surface];
  let text = readableAcross(requestedSurfaces, selected.text);
  let surface = selected.surface;
  if (requestedSurfaces.some((background) => contrastRatio(background, text) < 4.5)) {
    text = ensureReadableForeground(selected.background, selected.text);
    surface = surfaceCompatibleWithText(selected.surface, selected.background, text);
  }
  const neutralSurfaces = [selected.background, surface];
  const base = {
    ...selected,
    surface,
    text,
    textMuted: readableMuted(neutralSurfaces, selected.textMuted, text),
  };
  const onPrimary = contrastSafeForeground(base.primary);
  const onAccent = contrastSafeForeground(base.accent);
  const requestedHover = appearance.useCustomColors
    ? appearance.colors.primaryDark
    : mixColors(base.primary, "#000000", 0.18);
  const primaryHover = accessibleHover(base.primary, requestedHover, onPrimary);
  const featureHighlight = base.accent;
  const focus = readableAcross(neutralSurfaces, base.primary, 3);
  return {
    ...base,
    surfaceRaised: mixColors(base.surface, base.text, 0.025),
    primaryHover,
    primarySoft: mixColors(base.background, base.primary, 0.13),
    onPrimary,
    accentSoft: mixColors(base.background, base.accent, 0.22),
    onAccent,
    focus,
    success: "#2f765d",
    warning: "#9a5b18",
    danger: "#aa343d",
    featureSurface: base.primary,
    featureText: onPrimary,
    featureMuted: readableMuted([base.primary], mixColors(base.primary, onPrimary, 0.72), onPrimary),
    featureHighlight,
    onFeatureHighlight: contrastSafeForeground(featureHighlight),
  };
}

export function themeTokenCss(tokens: ThemeTokens): Record<`--${string}`, string> {
  const focus = parseHexColor(tokens.focus);
  return {
    "--color-background": tokens.background,
    "--color-surface": tokens.surface,
    "--color-surface-raised": tokens.surfaceRaised,
    "--color-text": tokens.text,
    "--color-text-muted": tokens.textMuted,
    "--color-border": tokens.border,
    "--color-primary": tokens.primary,
    "--color-primary-hover": tokens.primaryHover,
    "--color-primary-soft": tokens.primarySoft,
    "--color-on-primary": tokens.onPrimary,
    "--color-accent": tokens.accent,
    "--color-accent-soft": tokens.accentSoft,
    "--color-on-accent": tokens.onAccent,
    "--color-focus": tokens.focus,
    "--color-success": tokens.success,
    "--color-warning": tokens.warning,
    "--color-danger": tokens.danger,
    "--color-feature-surface": tokens.featureSurface,
    "--color-feature-text": tokens.featureText,
    "--color-feature-muted": tokens.featureMuted,
    "--color-feature-highlight": tokens.featureHighlight,
    "--color-on-feature-highlight": tokens.onFeatureHighlight,
    "--focus-rgb": `${focus.red}, ${focus.green}, ${focus.blue}`,
  };
}
