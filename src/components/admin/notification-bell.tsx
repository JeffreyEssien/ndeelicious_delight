"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import type { AdminNotification } from "@/app/api/admin/notifications/route";

const SEEN_KEY = "ndee_admin_notifications_seen";
const PUSHED_KEY = "ndee_admin_notifications_pushed";
const typeIcon: Record<AdminNotification["type"], string> = {
  order: "orders",
  cake: "heart",
  review: "check",
  message: "user",
};

const pushSupported = () => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

async function registerWorker() {
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    // Service worker needs HTTPS or localhost; silently skip where unavailable.
  }
}

// Pop OS-level notifications for items the admin hasn't been alerted about yet, but only
// when the admin app isn't the focused tab (otherwise the in-app bell is enough).
async function pushNew(items: AdminNotification[]) {
  if (!pushSupported() || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  const last = localStorage.getItem(PUSHED_KEY) ?? "";
  const fresh = items.filter((item) => item.createdAt > last);
  if (!fresh.length) return;
  localStorage.setItem(PUSHED_KEY, items[0].createdAt);
  try {
    const registration = await navigator.serviceWorker.ready;
    for (const item of fresh.slice(0, 3))
      await registration.showNotification(item.title, {
        body: item.detail,
        tag: item.id,
        icon: "/brand-logo.jpg",
        data: { url: item.href ?? "/admin" },
      });
  } catch {
    // Ignore display failures (e.g. permission revoked mid-session).
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeen(localStorage.getItem(SEEN_KEY) ?? "");
    if (!pushSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    if (Notification.permission === "granted") void registerWorker();
  }, []);

  const load = useCallback(() => {
    fetch("/api/admin/notifications", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { notifications: [] }))
      .then((payload) => {
        const next: AdminNotification[] = payload.notifications ?? [];
        setItems(next);
        void pushNew(next);
      })
      .catch(() => {});
  }, []);

  async function enableAlerts() {
    if (!pushSupported()) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      // Start the alert clock now so the existing backlog doesn't all pop at once.
      localStorage.setItem(PUSHED_KEY, new Date().toISOString());
      await registerWorker();
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((item) => item.createdAt > seen).length;

  function markAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setSeen(now);
  }

  function openItem(item: AdminNotification) {
    setOpen(false);
    if (item.href) router.push(item.href);
  }

  return (
    <div className="admin-bell" ref={boxRef}>
      <button
        type="button"
        className="admin-bell-button"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" />
        {unread > 0 && <span className="admin-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="admin-bell-panel" role="dialog" aria-label="Notifications">
          <div className="admin-bell-head">
            <b>Notifications</b>
            {unread > 0 && (
              <button type="button" className="text-button" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {permission === "default" && (
            <button type="button" className="admin-bell-enable" onClick={enableAlerts}>
              <Icon name="bell" />
              Turn on alerts on this device
            </button>
          )}
          {permission === "denied" && (
            <p className="admin-bell-note">
              Alerts are blocked. Allow notifications for this site in your browser settings to get pop-ups.
            </p>
          )}
          {permission === "granted" && (
            <p className="admin-bell-note">Alerts are on for this device — you’ll get a pop-up for new activity.</p>
          )}
          {items.length === 0 ? (
            <p className="admin-bell-empty">You’re all caught up. New orders and requests will appear here.</p>
          ) : (
            <ul>
              {items.map((item) => {
                const isUnread = item.createdAt > seen;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={isUnread ? "unread" : ""}
                      onClick={() => openItem(item)}
                      disabled={!item.href}
                    >
                      <span className="admin-bell-icon">
                        <Icon name={typeIcon[item.type]} />
                      </span>
                      <span className="admin-bell-text">
                        <b>{item.title}</b>
                        <small>{item.detail}</small>
                      </span>
                      <span className="admin-bell-time">{timeAgo(item.createdAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
