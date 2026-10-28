export type PromoTheme = { background: string; glow: string; accent: string };

const HUE_BINS = 12;

function toHsl(r: number, g: number, b: number) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: (hue * 60 + 360) % 360, s: saturation, l: lightness };
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Builds a section theme from an image's RGBA pixels: finds the image's strongest
// colour family, then derives a dark background (so light text stays readable), a
// brighter glow, and a pale accent from it.
export function themeFromPixels(data: ArrayLike<number>): PromoTheme {
  const weights = new Array<number>(HUE_BINS).fill(0);
  const sums = Array.from({ length: HUE_BINS }, () => ({ h: 0, s: 0 }));
  let lightness = 0;
  let counted = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2]);
    lightness += l;
    counted += 1;
    // Favour rich mid-tone colours; near-white and near-black pixels say little about mood.
    const weight = s * (1 - Math.abs(2 * l - 1));
    if (weight < 0.08) continue;
    const bin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
    weights[bin] += weight;
    sums[bin].h += h * weight;
    sums[bin].s += s * weight;
  }
  const best = weights.indexOf(Math.max(...weights));
  if (!counted || weights[best] === 0) {
    // A greyscale image: stay neutral, keeping its overall brightness as a hint.
    const tone = counted ? lightness / counted : 0.5;
    return {
      background: hsl(0, 0, 0.1),
      glow: hsl(0, 0, clamp(tone, 0.45, 0.7)),
      accent: hsl(0, 0, 0.85),
    };
  }
  const hue = sums[best].h / weights[best];
  const saturation = sums[best].s / weights[best];
  return {
    background: hsl(hue, clamp(saturation, 0.35, 0.7), 0.12),
    glow: hsl(hue, clamp(saturation, 0.55, 0.9), 0.52),
    accent: hsl(hue, clamp(saturation, 0.6, 0.9), 0.82),
  };
}
