"use client";
import { useCustomerText } from "@/components/customer-text-provider";

import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { canAutoplay, carouselIndex } from "@/features/catalog/carousel-state";
import { type PromoTheme, themeFromPixels } from "@/features/catalog/promo-theme";

// `theme` is optional: without it the colours are read from the image once it loads.
export type PromoSlide = { src: string; alt: string; label: string; href: string; theme?: PromoTheme };

const INTERVAL_MS = 4500;

function readTheme(image: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.drawImage(image, 0, 0, 32, 32);
    return themeFromPixels(context.getImageData(0, 0, 32, 32).data);
  } catch {
    // A cross-origin image without CORS headers cannot be read; keep the default colours.
    return undefined;
  }
}

// A stacked deck of portrait promo images: the active card sits in front and the
// next one peeks out behind it, so visitors can see there is more to come.
export function PromoCarousel({
  slides,
  label,
  onThemeChange,
}: {
  slides: PromoSlide[];
  label: string;
  onThemeChange?: (theme: PromoTheme | undefined) => void;
}) {
  const t = useCustomerText("promo carousel");
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [readThemes, setReadThemes] = useState<Record<string, PromoTheme>>({});
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number, manual = true) => {
      const resolved = carouselIndex(next, count, true);
      setIndex(resolved);
      if (manual) {
        setUserPaused(true);
        setAnnouncement(
          t("Slide {value1} of {value2}: {value3}", {
            value1: resolved + 1,
            value2: count,
            value3: slides[resolved].label,
          }),
        );
      }
    },
    [count, slides, t],
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const activeTheme = slides[index]?.theme ?? readThemes[slides[index]?.src];
  useEffect(() => onThemeChange?.(activeTheme), [activeTheme, onThemeChange]);

  const running = canAutoplay({ enabled: true, userPaused, hovered, focusWithin, reducedMotion, count });
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(index + 1, false), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [go, index, running]);

  if (!count) return null;
  return (
    <section
      className="promo-carousel"
      aria-roledescription={"carousel"}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse")
          pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start || start.id !== event.pointerId) return;
        const horizontal = event.clientX - start.x;
        const vertical = event.clientY - start.y;
        if (Math.abs(horizontal) < 40 || Math.abs(horizontal) <= Math.abs(vertical) * 1.2) return;
        go(index + (horizontal < 0 ? 1 : -1));
      }}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
    >
      <div className="promo-deck">
        {slides.map((slide, slideIndex) => {
          // 0 = front card, 1 = the next card peeking out behind it, the rest wait hidden.
          const depth = (slideIndex - index + count) % count;
          return (
            <Link
              key={slide.src}
              href={slide.href}
              className={"promo-card"}
              data-depth={depth > 1 ? "hidden" : depth}
              aria-hidden={depth !== 0}
              tabIndex={depth === 0 ? undefined : -1}
              aria-label={slide.label}
            >
              <Image
                src={slide.src}
                alt={slide.alt}
                fill
                quality={75}
                loading={slideIndex === 0 ? "eager" : undefined}
                sizes={"(max-width: 800px) 86vw, 440px"}
                onLoad={(event) => {
                  if (slide.theme || readThemes[slide.src]) return;
                  const theme = readTheme(event.currentTarget);
                  if (theme) setReadThemes((current) => ({ ...current, [slide.src]: theme }));
                }}
              />
            </Link>
          );
        })}
      </div>
      {count > 1 && (
        <div className="promo-controls no-print">
          <button type="button" onClick={() => go(index - 1)} aria-label={t("Previous slide")}>
            ←
          </button>
          <fieldset aria-label={t("Choose a slide")}>
            {slides.map((slide, slideIndex) => (
              <button
                type="button"
                key={slide.src}
                className={slideIndex === index ? "active" : ""}
                onClick={() => go(slideIndex)}
                aria-label={t("Show {value1}", { value1: slide.label })}
                aria-current={slideIndex === index ? "true" : undefined}
              >
                {/* The key restarts the fill animation each time the timer starts over. */}
                <span
                  key={slideIndex === index && running ? `run-${index}` : "idle"}
                  className={slideIndex === index && running ? "running" : ""}
                  style={{ animationDuration: `${INTERVAL_MS}ms` }}
                />
              </button>
            ))}
          </fieldset>
          <button type="button" onClick={() => go(index + 1)} aria-label={t("Next slide")}>
            →
          </button>
          {!reducedMotion && (
            <button
              type="button"
              className="promo-pause"
              aria-label={userPaused ? t("Play automatic slides") : t("Pause automatic slides")}
              onClick={() => setUserPaused((value) => !value)}
            >
              {userPaused ? t("Play") : t("Pause")}
            </button>
          )}
        </div>
      )}
      <p className="sr-only" aria-live={"polite"} aria-atomic={"true"}>
        {announcement}
      </p>
    </section>
  );
}

// The ready-to-bake band: its background, glow and accent colours follow the image on show.
export function PromoShowcase({
  slides,
  label,
  children,
}: {
  slides: PromoSlide[];
  label: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<PromoTheme>();
  const style = theme
    ? ({ "--promo-bg": theme.background, "--promo-glow": theme.glow, "--promo-accent": theme.accent } as CSSProperties)
    : undefined;
  return (
    <section className="ready-feature promo-themed" style={style}>
      <div className="site-container ready-grid">
        {children}
        <PromoCarousel slides={slides} label={label} onThemeChange={setTheme} />
      </div>
    </section>
  );
}
