"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useState } from "react";
import { useMoney } from "@/components/providers";
import { PromoCarousel, type PromoSlide } from "@/components/product/promo-carousel";
import { ContentLines } from "@/components/ui/content-lines";
import { Icon } from "@/components/ui/icons";
import type { PromoTheme } from "@/features/catalog/promo-theme";

export type HeroLink = { label: string; href: string };
export type HeroSlide = PromoSlide & {
  eyebrow: string;
  headline: string;
  body: string;
  primary: HeroLink;
  secondary?: HeroLink;
  /** Price in minor units; shown as "from" when `priceFrom` is set. */
  price?: number;
  priceFrom?: boolean;
  priceNote?: string;
};

// The first thing customers see: each slide pairs a product image with its own pitch,
// price and order button. The band stays in the brand colour; the image on show tints its glow.
export function HeroShowcase({
  slides,
  label,
  perks,
  fromLabel,
}: {
  slides: HeroSlide[];
  label: string;
  perks: string[];
  fromLabel: string;
}) {
  const money = useMoney();
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState<PromoTheme>();
  const onSlideChange = useCallback((index: number, next: PromoTheme | undefined) => {
    setActive(index);
    setTheme(next);
  }, []);
  const style = theme ? ({ "--promo-glow": theme.glow, "--promo-accent": theme.accent } as CSSProperties) : undefined;

  return (
    <section className="hero-showcase" style={style}>
      <div className="site-container hero-showcase-grid">
        <div className="hero-copy-stack">
          {slides.map((slide, index) => {
            const Heading = index === 0 ? "h1" : "h2";
            const current = index === active;
            return (
              <div className="hero-copy" data-active={current} aria-hidden={!current} inert={!current} key={slide.src}>
                <span className="overline">{slide.eyebrow}</span>
                <Heading>
                  <ContentLines text={slide.headline} />
                </Heading>
                <p>{slide.body}</p>
                {slide.price !== undefined && (
                  <p className="hero-price">
                    {slide.priceFrom && <span>{fromLabel}</span>}
                    <strong>{money(slide.price)}</strong>
                    {slide.priceNote && <span>{slide.priceNote}</span>}
                  </p>
                )}
                <div className="hero-buttons">
                  <Link className="button button-primary" href={slide.primary.href}>
                    {slide.primary.label} <Icon name="arrow" />
                  </Link>
                  {slide.secondary && (
                    <Link className="button button-link" href={slide.secondary.href}>
                      {slide.secondary.label}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <PromoCarousel slides={slides} label={label} intervalMs={6000} lead onSlideChange={onSlideChange} />
      </div>
      {perks.length > 0 && (
        <ul className="site-container hero-perks">
          {perks.map((perk) => (
            <li key={perk}>{perk}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
