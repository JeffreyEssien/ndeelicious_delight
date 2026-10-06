import { revalidateTag } from "next/cache";

export function invalidateStorefrontCache() {
  try {
    revalidateTag("storefront", { expire: 0 });
  } catch (error) {
    // Direct route-unit invocation has no Next.js static-generation store.
    if (process.env.NODE_ENV !== "test") throw error;
  }
}
