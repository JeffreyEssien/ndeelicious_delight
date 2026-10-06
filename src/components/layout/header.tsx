"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart, useProducts } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { BrandLogo } from "@/components/layout/brand-logo";
import { trackCommerceEvent } from "@/lib/analytics/client";
import type { BusinessSettings, StorefrontContent } from "@/types/content";

export function Header({ content, business }: { content: StorefrontContent["global"]; business: BusinessSettings }) {
  const t = useCustomerText("header");

  const path = usePathname();
  const cart = useCart();
  const products = useProducts();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [interactive, setInteractive] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previousPath = useRef(path);
  const nav = content.navigation;
  useEffect(() => {
    setInteractive(true);
  }, []);
  useEffect(() => {
    if (previousPath.current !== path) setMenu(false);
    previousPath.current = path;
  }, [path]);
  useEffect(() => {
    if (search) input.current?.focus();
  }, [search]);
  const results = query.trim()
    ? products
        .filter((p) => `${p.name} ${p.shortDescription} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
    : [];
  useEffect(() => {
    if (!search || query.trim().length < 2) return;
    const timer = window.setTimeout(
      () => trackCommerceEvent("SEARCH_PERFORMED", { metadata: { resultCount: results.length } }),
      700,
    );
    return () => window.clearTimeout(timer);
  }, [query, results.length, search]);
  return (
    <>
      <div className="announcement">
        {content.announcement.text} <Link href={content.announcement.href}>{content.announcement.linkLabel}</Link>
      </div>
      <header className="site-header">
        <div className="site-container nav-row">
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMenu(true)}
            aria-label={t("Open navigation")}
            data-ui-ready={interactive}
          >
            <Icon name="menu" />
          </button>
          <Link className="brand" href="/" aria-label={t("{value1} home", { value1: business.businessName })}>
            <BrandLogo compact priority />
          </Link>
          <nav className="desktop-nav" aria-label={t("Primary")}>
            {nav.map((n) => (
              <Link className={path === n.href ? "active" : ""} href={n.href} key={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <button type="button" className="icon-button" onClick={() => setSearch(true)} aria-label={t("Search")}>
              <Icon name="search" />
            </button>
            <Link href="/contact" className="icon-button desktop-only" aria-label={t("Contact")}>
              <Icon name="user" />
            </Link>
            <button
              type="button"
              className="cart-button"
              onClick={() => cart.setOpen(true)}
              aria-label={t("Open basket, {value1} items", { value1: cart.count })}
            >
              <Icon name="bag" />
              <span className="desktop-only">{t("Basket")}</span>
              <b>{cart.count}</b>
            </button>
          </div>
        </div>
      </header>
      <ModalOverlay
        open={menu}
        onClose={() => setMenu(false)}
        className="mobile-panel is-open"
        ariaLabel={"Navigation"}
      >
        <div className="panel-head">
          <span className="brand">
            <BrandLogo compact />
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setMenu(false)}
            aria-label={t("Close navigation")}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav>
          {nav.map((n) => (
            <Link href={n.href} key={n.href}>
              {n.label}
              <Icon name="arrow" />
            </Link>
          ))}
          <Link href="/contact">
            {t("Contact us")}
            <Icon name="arrow" />
          </Link>
        </nav>
        {(business.address || business.openingHours) && (
          <p>
            {business.address}
            {business.address && business.openingHours && <br />}
            {business.openingHours}
          </p>
        )}
      </ModalOverlay>
      <ModalOverlay
        open={search}
        onClose={() => {
          setSearch(false);
          setQuery("");
        }}
        className="search-overlay is-open"
        ariaLabel={"Search products"}
        initialFocusRef={input}
      >
        <div className="site-container">
          <div className="search-bar">
            <Icon name="search" />
            <label className="sr-only" htmlFor={"site-search"}>
              {t("Search products")}
            </label>
            <input
              ref={input}
              id="site-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search cakes, pastries, flavours…")}
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setSearch(false);
                setQuery("");
              }}
              aria-label={t("Close search")}
            >
              <Icon name="close" />
            </button>
          </div>
          {query && (
            <div className="search-results">
              <p>{results.length ? t("{value1} suggestions", { value1: results.length }) : t("No treats found")}</p>
              {results.map((p) => (
                <Link
                  key={p.id}
                  href={`/product/${p.slug}`}
                  onClick={() => {
                    setSearch(false);
                    setQuery("");
                  }}
                >
                  <span
                    className={`search-thumb ${p.image ? "" : "missing-image"}`}
                    style={
                      p.image ? { backgroundImage: `url(${p.image})`, backgroundPosition: p.imagePosition } : undefined
                    }
                  >
                    {!p.image && <span className="sr-only">{t("No image uploaded")}</span>}
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <small>{p.shortDescription}</small>
                  </span>
                  <Icon name="arrow" />
                </Link>
              ))}
              {!results.length && (
                <Link href="/shop" onClick={() => setSearch(false)}>
                  {t("Browse all products")}
                  <Icon name="arrow" />
                </Link>
              )}
            </div>
          )}
        </div>
      </ModalOverlay>
    </>
  );
}
