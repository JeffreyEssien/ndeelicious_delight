"use client";
import { useCustomerText } from "@/components/customer-text-provider";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart, useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import type { Product } from "@/types";
import type { StoreCarousel } from "@/types/content";
import { getDefaultPurchasableVariant, getPurchasableVariants } from "@/features/catalog/availability";
import { canAutoplay, carouselIndex } from "@/features/catalog/carousel-state";

export function ProductCarousel({
  products,
  settings,
  preview = false,
}: {
  products: Product[];
  settings: StoreCarousel;
  preview?: boolean;
}) {
  const t = useCustomerText("product carousel");

  const chosen = useMemo(
    () =>
      settings.productIds.flatMap((id) => {
        const product = products.find((item) => item.id === id && item.status === "ACTIVE");
        return product ? [product] : [];
      }),
    [products, settings.productIds],
  );
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const region = useRef<HTMLElement>(null);
  const money = useMoney();
  const cart = useCart();
  const count = chosen.length;
  const go = useCallback(
    (next: number, manual = true) => {
      if (!count) return;
      if (!settings.loop && (next < 0 || next >= count)) return;
      const resolved = carouselIndex(next, count, settings.loop);
      setIndex(resolved);
      if (manual) {
        setUserPaused(true);
        setAnnouncement(
          t("Product {value1} of {value2}: {value3}", {
            value1: resolved + 1,
            value2: count,
            value3: chosen[resolved].name,
          }),
        );
      }
    },
    [chosen, count, settings.loop, t],
  );

  useEffect(() => setIndex((current) => Math.min(current, Math.max(0, count - 1))), [count]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (
      preview ||
      !canAutoplay({
        enabled: settings.autoplay,
        userPaused,
        hovered,
        focusWithin,
        reducedMotion: reduced.matches,
        count,
      })
    )
      return;
    const timer = window.setInterval(() => go(index + 1, false), settings.intervalMs);
    return () => window.clearInterval(timer);
  }, [count, focusWithin, go, hovered, index, preview, settings.autoplay, settings.intervalMs, userPaused]);

  if (!settings.enabled || !count) return null;
  const product = chosen[index];
  const purchasableVariants = getPurchasableVariants(product);
  const defaultVariant = getDefaultPurchasableVariant(product);
  return (
    <section
      className={`product-carousel carousel-${settings.style}`}
      aria-roledescription={"carousel"}
      aria-label={settings.headline}
      ref={region}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false);
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
      <div className="site-container carousel-heading">
        <div>
          <span className="overline">{settings.eyebrow}</span>
          <h2>{settings.headline}</h2>
        </div>
        <p>{settings.body}</p>
      </div>
      <div className="site-container carousel-stage">
        <Link
          className="carousel-image"
          href={`/product/${encodeURIComponent(product.slug)}`}
          aria-label={t("View {value1}", { value1: product.name })}
        >
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              priority={preview}
              sizes={"(max-width: 800px) 100vw, 55vw"}
              style={{ objectPosition: product.imagePosition }}
            />
          ) : (
            <span className="missing-image">{t("No product image uploaded")}</span>
          )}
          {product.badge && <b className="carousel-badge">{product.badge}</b>}
          <span className="carousel-count">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
        </Link>
        <article className="carousel-copy">
          <span>{t(product.category.replaceAll("_", " "))}</span>
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
              {t("View details")}
              <Icon name="arrow" />
            </Link>
            {settings.showAddToCart && defaultVariant && purchasableVariants.length === 1 && (
              <button
                className="button button-primary"
                type="button"
                onClick={() => cart.add(product, defaultVariant.id)}
              >
                {t("Add to basket")}
              </button>
            )}
            {settings.showAddToCart && purchasableVariants.length > 1 && (
              <Link className="button button-primary" href={`/product/${product.slug}`}>
                {t("Choose options")}
              </Link>
            )}
            {settings.showAddToCart && !purchasableVariants.length && (
              <button className="button button-primary" type="button" disabled>
                {t("Currently unavailable")}
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
              aria-label={t("Previous product")}
            >
              ←
            </button>
            <fieldset className={count > 5 ? "many-slides" : ""} aria-label={t("Choose a product slide")}>
              {chosen.map((item, itemIndex) => (
                <button
                  type="button"
                  key={item.id}
                  className={itemIndex === index ? "active" : ""}
                  onClick={() => go(itemIndex)}
                  aria-label={t("Show {value1}", { value1: item.name })}
                  aria-current={itemIndex === index ? "true" : undefined}
                >
                  <span />
                </button>
              ))}
            </fieldset>
            <span className="carousel-mobile-position" aria-hidden={"true"}>
              {index + 1} {t("of ")}
              {count}
            </span>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={!settings.loop && index === count - 1}
              aria-label={t("Next product")}
            >
              →
            </button>
            {settings.autoplay && !preview && (
              <button
                type="button"
                className="carousel-pause"
                aria-label={userPaused ? t("Play automatic product slides") : t("Pause automatic product slides")}
                onClick={() => setUserPaused((value) => !value)}
              >
                {userPaused ? t("Play") : t("Pause")}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live={"polite"} aria-atomic={"true"}>
        {announcement}
      </p>
    </section>
  );
}
