"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart, useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import type { Product } from "@/types";
import type { StoreCarousel } from "@/types/content";

export function ProductCarousel({
  products,
  settings,
  preview = false,
}: {
  products: Product[];
  settings: StoreCarousel;
  preview?: boolean;
}) {
  const chosen = settings.productIds.flatMap((id) => {
    const product = products.find((item) => item.id === id && item.status === "ACTIVE");
    return product ? [product] : [];
  });
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [manualChange, setManualChange] = useState(false);
  const region = useRef<HTMLElement>(null);
  const money = useMoney();
  const cart = useCart();
  const count = chosen.length;
  const paused = userPaused || hovered || focusWithin;
  const go = useCallback(
    (next: number, manual = true) => {
      if (!count) return;
      if (!settings.loop && (next < 0 || next >= count)) return;
      setIndex((next + count) % count);
      setManualChange(manual);
    },
    [count, settings.loop],
  );

  useEffect(() => setIndex((current) => Math.min(current, Math.max(0, count - 1))), [count]);
  useEffect(() => {
    if (!settings.autoplay || paused || count < 2 || preview) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const timer = window.setInterval(() => go(index + 1, false), settings.intervalMs);
    return () => window.clearInterval(timer);
  }, [count, go, index, paused, preview, settings.autoplay, settings.intervalMs]);

  if (!settings.enabled || !count) return null;
  const product = chosen[index];
  const unavailable = product.status !== "ACTIVE";
  return (
    <section
      className={`product-carousel carousel-${settings.style}`}
      aria-roledescription="carousel"
      aria-label={settings.headline}
      ref={region}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
      }}
    >
      <div className="site-container carousel-heading">
        <div>
          <span className="overline">{settings.eyebrow}</span>
          <h2>{settings.headline}</h2>
        </div>
        <p>{settings.body}</p>
      </div>
      <div className="site-container carousel-stage">
        <div className="carousel-image">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              priority={preview}
              sizes="(max-width: 800px) 100vw, 55vw"
              style={{ objectPosition: product.imagePosition }}
            />
          ) : (
            <span className="missing-image">No product image uploaded</span>
          )}
          {product.badge && <b className="carousel-badge">{product.badge}</b>}
          <span className="carousel-count">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
        </div>
        <article className="carousel-copy" aria-live={manualChange ? "polite" : "off"} aria-atomic="true">
          <span>{product.category.replaceAll("_", " ")}</span>
          <h3>{product.name}</h3>
          <p>{product.shortDescription || product.description}</p>
          {settings.showPrices && (
            <div className="carousel-price">
              <strong>{money(product.discountPrice ?? product.price)}</strong>
              {product.discountPrice && <del>{money(product.price)}</del>}
            </div>
          )}
          <div className="carousel-actions">
            <Link className="button button-secondary" href={`/product/${product.slug}`}>
              View details <Icon name="arrow" />
            </Link>
            {settings.showAddToCart && (
              <button
                className="button button-primary"
                type="button"
                disabled={unavailable}
                onClick={() => cart.add(product)}
              >
                Add to basket
              </button>
            )}
          </div>
        </article>
        {count > 1 && (
          <div className="carousel-controls no-print">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={!settings.loop && index === 0}
              aria-label="Previous product"
            >
              ←
            </button>
            <div aria-label="Choose a product slide">
              {chosen.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  className={itemIndex === index ? "active" : ""}
                  onClick={() => go(itemIndex)}
                  aria-label={`Show ${item.name}`}
                  aria-current={itemIndex === index ? "true" : undefined}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={!settings.loop && index === count - 1}
              aria-label="Next product"
            >
              →
            </button>
            {settings.autoplay && !preview && (
              <button type="button" className="carousel-pause" onClick={() => setUserPaused((value) => !value)}>
                {userPaused ? "Play" : "Pause"}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
