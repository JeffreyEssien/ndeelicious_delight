"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { Icon } from "@/components/ui/icons";
import { canUsePush, needsHomeScreen, subscribeThisBrowser } from "@/lib/push/client";
import { useEffect, useState } from "react";

const STORE_KEY = "ndee_push_orders";

function remembered(orderNumber: string) {
  try {
    return (JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as string[]).includes(orderNumber);
  } catch {
    return false;
  }
}
function remember(orderNumber: string) {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as string[];
    localStorage.setItem(STORE_KEY, JSON.stringify([...new Set([...list, orderNumber])].slice(-20)));
  } catch {
    // Storage can be unavailable (private mode); the subscription itself still works.
  }
}

type State = "hidden" | "idle" | "working" | "on" | "blocked" | "error" | "home-screen";

/** Lets a customer get browser notifications as their order moves along. */
export function OrderPushButton({
  orderNumber,
  sessionId,
  email,
}: {
  orderNumber: string;
  sessionId?: string;
  email?: string;
}) {
  const t = useCustomerText("order notifications");
  const [state, setState] = useState<State>("hidden");
  useEffect(() => {
    if (canUsePush())
      setState(Notification.permission === "denied" ? "blocked" : remembered(orderNumber) ? "on" : "idle");
    else if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && needsHomeScreen()) setState("home-screen");
  }, [orderNumber]);

  async function enable() {
    setState("working");
    try {
      const subscription = await subscribeThisBrowser();
      if (!subscription) {
        setState(Notification.permission === "denied" ? "blocked" : "idle");
        return;
      }
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription, orderNumber, sessionId, email }),
      });
      if (!response.ok) throw new Error("subscribe-failed");
      remember(orderNumber);
      setState("on");
    } catch {
      setState("error");
    }
  }

  if (state === "hidden") return null;
  if (state === "home-screen")
    return <p className="order-push-note">{t("On iPhone? Add this site to your Home Screen to get order alerts.")}</p>;
  if (state === "on")
    return (
      <p className="order-push-note is-on">
        <Icon name="bell" /> {t("You’ll get a ping on this device when your order moves.")}
      </p>
    );
  if (state === "blocked")
    return <p className="order-push-note">{t("Notifications are blocked for this site in your browser settings.")}</p>;
  return (
    <div className="order-push">
      <button type="button" className="button button-secondary" onClick={enable} disabled={state === "working"}>
        <Icon name="bell" /> {state === "working" ? t("Turning on…") : t("Ping me with updates")}
      </button>
      {state === "error" && <p className="order-push-note">{t("That didn’t work. Please try again.")}</p>}
    </div>
  );
}
