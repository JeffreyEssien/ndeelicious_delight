"use client";
import { useCallback, useEffect, useState } from "react";

// Guest wishlist held in the browser. No account needed; when customer accounts land
// later this can sync to the server. Changes broadcast so every heart + the header
// badge stay in step across the page and across tabs.
const KEY = "ndee_wishlist";
const EVENT = "ndee-wishlist";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(read());
    const sync = () => setIds(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, has, toggle, count: ids.length };
}
