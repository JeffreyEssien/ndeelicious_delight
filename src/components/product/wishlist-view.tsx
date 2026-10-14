"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCustomerText } from "@/components/customer-text-provider";
import { useProducts } from "@/components/providers";
import { useWishlist } from "@/components/wishlist";
import { EmptyState } from "@/components/ui/primitives";
import { ProductGrid } from "./product-grid";

export function WishlistView() {
  const t = useCustomerText("wishlist");
  const wishlist = useWishlist();
  const products = useProducts();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The saved list lives in the browser, so wait for the client before judging it empty.
  if (!mounted) return <div className="wishlist-loading" aria-hidden="true" />;
  const saved = products.filter((product) => wishlist.has(product.id));
  if (!saved.length)
    return (
      <EmptyState
        title={t("Your favourites list is empty")}
        body={t("Tap the heart on any treat to save it here for later.")}
        action={
          <Link className="button button-primary" href="/shop">
            {t("Browse the bakery")}
          </Link>
        }
      />
    );
  return <ProductGrid items={saved} />;
}
