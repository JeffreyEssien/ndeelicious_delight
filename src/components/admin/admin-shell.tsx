"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { BrandLogo } from "@/components/layout/brand-logo";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";

type NavLink = { label: string; href: string; icon: string };
type NavGroup = { heading: string; links: NavLink[] };

// Grouped by what the owner is trying to do, not by what the system stores.
// "Today" is the daily loop; "Store setup" is configure-once; "Insights" is demoted.
const navGroups: NavGroup[] = [
  {
    heading: "Today",
    links: [
      { label: "Today", href: "/admin", icon: "grid" },
      { label: "Orders", href: "/admin/orders", icon: "orders" },
    ],
  },
  {
    heading: "Catalogue",
    links: [
      { label: "Products", href: "/admin/products", icon: "box" },
      { label: "Categories", href: "/admin/categories", icon: "grid" },
      { label: "Flavours & sizes", href: "/admin/cakes", icon: "heart" },
      { label: "Stock", href: "/admin/inventory", icon: "grid" },
      { label: "Customers", href: "/admin/customers", icon: "user" },
      { label: "Reviews", href: "/admin/reviews", icon: "check" },
    ],
  },
  {
    heading: "Store setup",
    links: [
      { label: "Delivery & pricing", href: "/admin/delivery", icon: "truck" },
      { label: "Coupons & offers", href: "/admin/coupons", icon: "coupon" },
      { label: "Website content", href: "/admin/content", icon: "orders" },
      { label: "Homepage", href: "/admin/carousel", icon: "grid" },
      { label: "Marketing posts", href: "/admin/marketing", icon: "upload" },
      { label: "Business details", href: "/admin/settings", icon: "settings" },
    ],
  },
  {
    heading: "Insights",
    links: [
      { label: "Reports", href: "/admin/analytics", icon: "chart" },
      { label: "Activity log", href: "/admin/audit", icon: "clock" },
    ],
  },
];

// The three daily jobs, one thumb-tap away on a phone. "More" opens the full drawer.
const bottomLinks: NavLink[] = [
  { label: "Today", href: "/admin", icon: "grid" },
  { label: "Orders", href: "/admin/orders", icon: "orders" },
  { label: "Products", href: "/admin/products", icon: "box" },
];

function AdminNav({ path, onNavigate }: { path: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Admin sections">
      {navGroups.map((group) => (
        <div className="admin-nav-group" key={group.heading}>
          <p className="admin-nav-heading">{group.heading}</p>
          {group.links.map((link) => (
            <Link className={path === link.href ? "active" : ""} href={link.href} key={link.href} onClick={onNavigate}>
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);
  if (path === "/admin/login") return <>{children}</>;
  return (
    <div className="admin-shell admin-mode">
      <a className="skip-link" href="#admin-main-content">
        Skip to main content
      </a>
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
        <AdminNav path={path} onNavigate={() => setMobile(false)} />
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
        <AdminNav path={path} onNavigate={() => setMobile(false)} />
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
          <GlobalSearch />
          <div className="admin-topbar-actions">
            <NotificationBell />
            <a href="/" target="_blank" rel="noopener">
              View storefront ↗
            </a>
          </div>
        </header>
        <main id="admin-main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="admin-bottom-nav" aria-label="Quick navigation">
        {bottomLinks.map((link) => (
          <Link key={link.href} href={link.href} className={path === link.href ? "active" : ""}>
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMobile(true)}>
          <Icon name="menu" />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
