"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import type { AdminSearchResult } from "@/app/api/admin/search/route";

const typeIcon: Record<AdminSearchResult["type"], string> = {
  order: "orders",
  cake: "heart",
  product: "box",
  customer: "user",
};
const typeLabel: Record<AdminSearchResult["type"], string> = {
  order: "Order",
  cake: "Cake request",
  product: "Product",
  customer: "Customer",
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.json())
        .then((payload) => {
          setResults(payload.results ?? []);
          setActive(-1);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(result: AdminSearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      go(results[active]);
    }
  }

  const showPanel = open && query.trim().length >= 2;
  return (
    <div className="admin-search" ref={boxRef}>
      <Icon name="search" />
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Search orders, cakes, products, customers…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showPanel && (
        <div className="admin-search-panel" id={listId} role="listbox">
          {loading && !results.length ? (
            <p className="admin-search-status" role="status">
              Searching…
            </p>
          ) : results.length ? (
            results.map((result, index) => (
              <button
                type="button"
                key={`${result.type}:${result.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : ""}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(result)}
              >
                <span className="admin-search-icon">
                  <Icon name={typeIcon[result.type]} />
                </span>
                <span className="admin-search-text">
                  <b>{result.label}</b>
                  <small>{result.sublabel}</small>
                </span>
                <span className="admin-search-kind">{typeLabel[result.type]}</span>
              </button>
            ))
          ) : (
            <p className="admin-search-status">No matches. Try a name, order number or email.</p>
          )}
        </div>
      )}
    </div>
  );
}
