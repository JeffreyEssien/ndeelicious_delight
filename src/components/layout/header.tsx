"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart, useProducts } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { BrandLogo } from "@/components/layout/brand-logo";
import type { BusinessSettings, StorefrontContent } from "@/types/content";

export function Header({ content, business }: { content: StorefrontContent["global"]; business: BusinessSettings }) {
  const path = usePathname();
  const cart = useCart();
  const products = useProducts();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nav = content.navigation;
  // biome-ignore lint/correctness/useExhaustiveDependencies: Navigation should always close the mobile menu.
  useEffect(() => {
    setMenu(false);
  }, [path]);
  useEffect(() => {
    if (search) input.current?.focus();
  }, [search]);
  const results = query.trim()
    ? products
        .filter((p) => `${p.name} ${p.shortDescription} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
    : [];
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
            aria-label="Open navigation"
          >
            <Icon name="menu" />
          </button>
          <Link className="brand" href="/" aria-label={`${business.businessName} home`}>
            <BrandLogo compact />
          </Link>
          <nav className="desktop-nav" aria-label="Primary">
            {nav.map((n) => (
              <Link className={path === n.href ? "active" : ""} href={n.href} key={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <button type="button" className="icon-button" onClick={() => setSearch(true)} aria-label="Search">
              <Icon name="search" />
            </button>
            <Link href="/contact" className="icon-button desktop-only" aria-label="Contact">
              <Icon name="user" />
            </Link>
            <button
              type="button"
              className="cart-button"
              onClick={() => cart.setOpen(true)}
              aria-label={`Open basket, ${cart.count} items`}
            >
              <Icon name="bag" />
              <span className="desktop-only">Basket</span>
              <b>{cart.count}</b>
            </button>
          </div>
        </div>
      </header>
      <div className={`mobile-panel ${menu ? "is-open" : ""}`} aria-hidden={!menu}>
        <div className="panel-head">
          <span className="brand">
            <BrandLogo compact />
          </span>
          <button type="button" className="icon-button" onClick={() => setMenu(false)} aria-label="Close navigation">
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
            Contact us
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
      </div>
      {menu && <button type="button" className="scrim" onClick={() => setMenu(false)} aria-label="Close navigation" />}
      <div className={`search-overlay ${search ? "is-open" : ""}`} aria-hidden={!search}>
        <div className="site-container">
          <div className="search-bar">
            <Icon name="search" />
            <label className="sr-only" htmlFor="site-search">
              Search products
            </label>
            <input
              ref={input}
              id="site-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cakes, pastries, flavours…"
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setSearch(false);
                setQuery("");
              }}
              aria-label="Close search"
            >
              <Icon name="close" />
            </button>
          </div>
          {query && (
            <div className="search-results">
              <p>{results.length ? `${results.length} suggestions` : "No treats found"}</p>
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
                    {!p.image && <span className="sr-only">No image uploaded</span>}
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
                  Browse all products <Icon name="arrow" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
