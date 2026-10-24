"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CartLine, CartSelection, DeliveryZone, Product } from "@/types";
import type { BusinessSettings } from "@/types/content";
import { formatMoney } from "@/lib/format";
import type { StoreTheme, ThemeTokens } from "@/lib/theme/tokens";
import {
  getDefaultPurchasableVariant,
  getPurchasableVariants,
  variantQuantityLimit,
} from "@/features/catalog/availability";
import { lineUnitPrice } from "@/features/catalog/pricing";
import { trackCommerceEvent } from "@/lib/analytics/client";

type Toast = { id: number; message: string };
export type { StoreTheme } from "@/lib/theme/tokens";

// Two lines of the same product + variant but with different cake selections (e.g. different
// per-layer flavours) are distinct basket entries, so identity includes the selections.
export function lineKey(line: Pick<CartLine, "productId" | "variantId" | "selections">) {
  return `${line.productId}::${line.variantId}::${JSON.stringify(line.selections ?? [])}`;
}

type CartValue = {
  lines: CartLine[];
  count: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (product: Product, variantId?: string, quantity?: number, selections?: CartSelection[]) => void;
  update: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  subtotal: number;
};
type ThemeValue = { theme: StoreTheme; setTheme: (theme: StoreTheme) => void };
const CartContext = createContext<CartValue | null>(null);
const ToastContext = createContext<(message: string) => void>(() => {});
const ThemeContext = createContext<ThemeValue | null>(null);
const ProductsContext = createContext<Product[]>([]);
const DeliveryZonesContext = createContext<DeliveryZone[]>([]);
const BusinessContext = createContext<BusinessSettings | null>(null);
const ThemeTokensContext = createContext<ThemeTokens | null>(null);

export function Providers({
  children,
  products,
  deliveryZones,
  initialTheme,
  business,
  themeTokens,
}: {
  children: React.ReactNode;
  products: Product[];
  deliveryZones: DeliveryZone[];
  initialTheme: StoreTheme;
  business: BusinessSettings;
  themeTokens: ThemeTokens;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<StoreTheme>(initialTheme);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ndee-cart-v1");
      if (saved) setLines(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("ndee-cart-v1", JSON.stringify(lines));
  }, [lines, ready]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const notify = useCallback((message: string) => {
    const id = Date.now();
    setToasts((v) => [...v, { id, message }]);
    window.setTimeout(() => setToasts((v) => v.filter((t) => t.id !== id)), 2800);
  }, []);
  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      open,
      setOpen,
      add(product, variantId, quantity = 1, selections) {
        if (product.shoppingMode === "MADE_TO_ORDER" && !variantId) {
          notify("Choose your pack before adding this product.");
          return;
        }
        const purchasable = getPurchasableVariants(product);
        const variant = variantId
          ? purchasable.find((item) => item.id === variantId)
          : getDefaultPurchasableVariant(product);
        if (!variant) {
          notify(
            purchasable.length > 1 ? "Choose an option before adding this product." : "This product is unavailable.",
          );
          return;
        }
        // Cakes expand flavour/filling into per-layer pickers, so their selection group names
        // ("Layer 1 flavour"…) don't match the stored group names — the product page already
        // enforces the required pickers, so here we just require that some selection was made.
        const requiredGroups = (product.optionGroups ?? []).filter((group) => group.required);
        if (product.category === "CUSTOM_CAKES") {
          if (requiredGroups.length && !selections?.some((s) => s.value)) {
            notify("Choose your flavours before adding this cake.");
            return;
          }
        } else {
          const missing = requiredGroups.find((group) => !selections?.some((s) => s.group === group.name && s.value));
          if (missing) {
            notify(`Choose ${missing.name} before adding this product.`);
            return;
          }
        }
        const limit = variantQuantityLimit(product, variant);
        if (limit < 1) {
          notify("This option is currently unavailable.");
          return;
        }
        const chosen = selections?.length ? selections : undefined;
        const key = lineKey({ productId: product.id, variantId: variant.id, selections: chosen });
        setLines((current) => {
          const found = current.find((l) => lineKey(l) === key);
          return found
            ? current.map((l) => (l === found ? { ...l, quantity: Math.min(limit, l.quantity + quantity) } : l))
            : [
                ...current,
                {
                  productId: product.id,
                  variantId: variant.id,
                  quantity: Math.min(limit, Math.max(1, quantity)),
                  selections: chosen,
                },
              ];
        });
        trackCommerceEvent("ADD_TO_CART", {
          productId: product.id,
          metadata: { variantId: variant.id, quantity: Math.min(limit, Math.max(1, quantity)) },
        });
        notify("Added to your basket.");
      },
      update(key, quantity) {
        setLines((v) => {
          const line = v.find((l) => lineKey(l) === key);
          if (!line) return v;
          const product = products.find((item) => item.id === line.productId);
          const variant = product?.variants.find((item) => item.id === line.variantId);
          const limit = product && variant ? variantQuantityLimit(product, variant) : 0;
          return quantity < 1 || limit < 1
            ? v.filter((l) => lineKey(l) !== key)
            : v.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.max(1, Math.min(limit, quantity)) } : l));
        });
      },
      remove(key) {
        setLines((v) => v.filter((l) => lineKey(l) !== key));
        trackCommerceEvent("REMOVE_FROM_CART", { metadata: { key } });
        notify("Removed from your basket.");
      },
      clear() {
        setLines([]);
      },
      subtotal: lines.reduce((sum, line) => {
        const p = products.find((x) => x.id === line.productId);
        const v = p?.variants.find((x) => x.id === line.variantId);
        return sum + (p && v ? lineUnitPrice(p, v, line.selections) : 0) * line.quantity;
      }, 0),
    }),
    [lines, open, products, notify],
  );
  return (
    <BusinessContext.Provider value={business}>
      <ThemeTokensContext.Provider value={themeTokens}>
        <ProductsContext.Provider value={products}>
          <DeliveryZonesContext.Provider value={deliveryZones}>
            <ThemeContext.Provider value={{ theme, setTheme }}>
              <ToastContext.Provider value={notify}>
                <CartContext.Provider value={value}>
                  {children}
                  <div className="toast-region" aria-live="polite">
                    {toasts.map((t) => (
                      <div className="toast" key={t.id}>
                        ✓ {t.message}
                      </div>
                    ))}
                  </div>
                </CartContext.Provider>
              </ToastContext.Provider>
            </ThemeContext.Provider>
          </DeliveryZonesContext.Provider>
        </ProductsContext.Provider>
      </ThemeTokensContext.Provider>
    </BusinessContext.Provider>
  );
}
export function useCart() {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart must be used inside Providers");
  return v;
}
export function useToast() {
  return useContext(ToastContext);
}
export function useStoreTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useStoreTheme must be used inside Providers");
  return value;
}
export function useProducts() {
  return useContext(ProductsContext);
}
export function useDeliveryZones() {
  return useContext(DeliveryZonesContext);
}

export function useBusinessSettings() {
  const value = useContext(BusinessContext);
  if (!value) throw new Error("Business settings are unavailable.");
  return value;
}

export function useThemeTokens() {
  const value = useContext(ThemeTokensContext);
  if (!value) throw new Error("Theme tokens are unavailable.");
  return value;
}

export function useMoney() {
  const business = useBusinessSettings();
  return useCallback(
    (minorUnits: number) => formatMoney(minorUnits, business.currency, business.locale),
    [business.currency, business.locale],
  );
}
