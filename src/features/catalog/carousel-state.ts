export function carouselIndex(next: number, count: number, loop: boolean) {
  if (count < 1) return 0;
  if (!loop) return Math.max(0, Math.min(count - 1, next));
  return (next + count) % count;
}

export function canAutoplay(input: {
  enabled: boolean;
  userPaused: boolean;
  hovered: boolean;
  focusWithin: boolean;
  reducedMotion: boolean;
  count: number;
}) {
  return (
    input.enabled &&
    !input.userPaused &&
    !input.hovered &&
    !input.focusWithin &&
    !input.reducedMotion &&
    input.count > 1
  );
}
