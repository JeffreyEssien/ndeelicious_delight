import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { defaultStoreHero } from "@/content/default-hero";
import { getStoreHero } from "./settings";

const client = (value: unknown) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: value === undefined ? null : { value }, error: null }),
        }),
      }),
    }),
  }) as never;

describe("getStoreHero", () => {
  it("uses the built-in slides before the owner has published any", async () => {
    expect(await getStoreHero(client(undefined))).toEqual(defaultStoreHero);
  });

  it("uses the built-in slides when the saved version no longer passes validation", async () => {
    expect(await getStoreHero(client({ slides: [] }))).toEqual(defaultStoreHero);
  });

  it("returns the owner's saved hero", async () => {
    const saved = { ...defaultStoreHero, perks: ["Fresh daily"], intervalMs: 8000 };
    expect(await getStoreHero(client(saved))).toEqual(saved);
  });
});
