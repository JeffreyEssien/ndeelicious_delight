"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { BrandLogo } from "@/components/layout/brand-logo";

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
  { label: "Delivery", href: "/admin/delivery", icon: "truck" },
  { label: "Settings", href: "/admin/settings", icon: "settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  if (path === "/admin/login") return <>{children}</>;
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobile ? "is-open" : ""}`}>
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
      {mobile && (
        <button
          type="button"
          className="scrim mobile-only"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
    </div>
  );
}
