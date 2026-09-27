import { describe, expect, it } from "vitest";
import { canAutoplay, carouselIndex } from "./carousel-state";

describe("carousel state", () => {
  it("wraps only when looping is enabled", () => {
    expect(carouselIndex(5, 5, true)).toBe(0);
    expect(carouselIndex(5, 5, false)).toBe(4);
    expect(carouselIndex(-1, 5, false)).toBe(0);
  });

  it("never rotates after manual pause until explicit play clears it", () => {
    const base = { enabled: true, hovered: false, focusWithin: false, reducedMotion: false, count: 3 };
    expect(canAutoplay({ ...base, userPaused: true })).toBe(false);
    expect(canAutoplay({ ...base, userPaused: false })).toBe(true);
  });

  it("honours reduced motion, hover, focus, and single-slide states", () => {
    const base = {
      enabled: true,
      userPaused: false,
      hovered: false,
      focusWithin: false,
      reducedMotion: false,
      count: 3,
    };
    expect(canAutoplay({ ...base, reducedMotion: true })).toBe(false);
    expect(canAutoplay({ ...base, hovered: true })).toBe(false);
    expect(canAutoplay({ ...base, focusWithin: true })).toBe(false);
    expect(canAutoplay({ ...base, count: 1 })).toBe(false);
  });
});
