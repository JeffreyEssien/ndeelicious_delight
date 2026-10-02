"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ModalOverlay } from "@/components/ui/modal-overlay";

const links = [
  { label: "Dashboard", href: "/admin", icon: "grid" },
  { label: "Orders", href: "/admin/orders", icon: "orders" },
  { label: "Custom cakes", href: "/admin/custom-cakes", icon: "heart" },
  { label: "Products", href: "/admin/products", icon: "box" },
  { label: "Inventory", href: "/admin/inventory", icon: "grid" },
  { label: "Customers", href: "/admin/customers", icon: "user" },
  { label: "Coupons", href: "/admin/coupons", icon: "coupon" },
  { label: "Reviews", href: "/admin/reviews", icon: "heart" },
  { label: "Content", href: "/admin/content", icon: "orders" },
  { label: "Homepage carousel", href: "/admin/carousel", icon: "grid" },
  { label: "Marketing", href: "/admin/marketing", icon: "image" },
  { label: "Delivery", href: "/admin/delivery", icon: "truck" },
  { label: "Audit log", href: "/admin/audit", icon: "orders" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);
  if (path === "/admin/login") return <>{children}</>;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar desktop-admin-sidebar">
        <div className="admin-brand">
          <span className="brand brand-light">
            <BrandLogo compact />
          </span>
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav>
          {links.map((l) => (
            <Link
              className={path === l.href ? "active" : ""}
              href={l.href}
              key={l.href}
              onClick={() => setMobile(false)}
            >
              <Icon name={l.icon} />
              <span>{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-user">
          <div>
            <b>Admin session</b>
            <small>Secure access</small>
          </div>
          <form action="/api/auth/admin/logout" method="post">
            <button type="submit" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </aside>
      <ModalOverlay
        open={mobile}
        onClose={() => setMobile(false)}
        className="admin-sidebar is-open mobile-admin-sidebar"
        ariaLabel="Admin navigation"
      >
        <div className="admin-brand">
          <span className="brand brand-light">
            <BrandLogo compact />
          </span>
          <button type="button" className="icon-button" onClick={() => setMobile(false)} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>
        <nav>
          {links.map((link) => (
            <Link
              className={path === link.href ? "active" : ""}
              href={link.href}
              key={link.href}
              onClick={() => setMobile(false)}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
      </ModalOverlay>
      <div className="admin-content">
        <header className="admin-topbar">
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" />
          </button>
          <span />
          <div>
            <a href="/" target="_blank" rel="noopener">
              View storefront ↗
            </a>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
