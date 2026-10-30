"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import type { AdminNotification } from "@/app/api/admin/notifications/route";
import { canUsePush, subscribeThisBrowser } from "@/lib/push/client";

const SEEN_KEY = "ndee_admin_notifications_seen";
const OPENED_KEY = "ndee_admin_notifications_opened";
const PUSHED_KEY = "ndee_admin_notifications_pushed";
// Set once this device has a real push subscription; the server then sends alerts even
// when the admin is closed, so the in-tab pop-ups below would only duplicate them.
const SERVER_PUSH_KEY = "ndee_admin_server_push";
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
  if (localStorage.getItem(SERVER_PUSH_KEY)) return;
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

/** Subscribes this device to server push so alerts arrive even with the admin closed. */
async function subscribeToServerPush() {
  if (!canUsePush()) return false;
  try {
    const subscription = await subscribeThisBrowser();
    if (!subscription) return false;
    const response = await fetch("/api/admin/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!response.ok) return false;
    localStorage.setItem(SERVER_PUSH_KEY, "1");
    return true;
  } catch {
    // The in-tab alerts keep working without server push.
    return false;
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
  const [opened, setOpened] = useState<string[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [serverPush, setServerPush] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeen(localStorage.getItem(SEEN_KEY) ?? "");
    try {
      setOpened(JSON.parse(localStorage.getItem(OPENED_KEY) ?? "[]"));
    } catch {
      setOpened([]);
    }
    setServerPush(Boolean(localStorage.getItem(SERVER_PUSH_KEY)));
    if (!pushSupported()) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    if (Notification.permission === "granted")
      void registerWorker().then(() => {
        if (!localStorage.getItem(SERVER_PUSH_KEY)) void subscribeToServerPush().then(setServerPush);
      });
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
      setServerPush(await subscribeToServerPush());
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

  const isUnread = (item: AdminNotification) => item.createdAt > seen && !opened.includes(item.id);
  const unread = items.filter(isUnread).length;

  function markAllRead() {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setSeen(now);
  }

  function openItem(item: AdminNotification) {
    setOpen(false);
    if (!item.href) return;
    setOpened((current) => {
      const next = [...new Set([...current, item.id])].slice(-100);
      localStorage.setItem(OPENED_KEY, JSON.stringify(next));
      return next;
    });
    if (item.href.startsWith("mailto:")) window.location.href = item.href;
    else router.push(item.href);
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
            <p className="admin-bell-note">
              {serverPush
                ? "Alerts are on for this device. You’ll get a notification for paid orders, cake requests and messages, even when the admin is closed."
                : "Alerts are on for this device. You’ll get a pop-up for new activity while the admin is open."}
            </p>
          )}
          {items.length === 0 ? (
            <p className="admin-bell-empty">You’re all caught up. New orders and requests will appear here.</p>
          ) : (
            <ul>
              {items.map((item) => {
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={isUnread(item) ? "unread" : ""}
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
                      {item.href && <Icon name="chevron" className="admin-bell-go" />}
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
