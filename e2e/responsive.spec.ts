import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Responsive/axe coverage does not test event ingestion. Keep synthetic visits
// out of business analytics; API ingestion has its own functional tests.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
});

const customerRoutes = [
  "/",
  "/shop",
  "/cart",
  "/checkout",
  "/custom-cakes",
  "/custom-cakes/build-your-cake",
  "/track-order",
];

const adminRoutes = [
  "/admin",
  "/admin/analytics",
  "/admin/orders",
  "/admin/custom-cakes",
  "/admin/products",
  "/admin/inventory",
  "/admin/coupons",
  "/admin/content",
  "/admin/carousel",
  "/admin/marketing",
  "/admin/delivery",
  "/admin/settings",
];

const tokenizedCustomerRoutes = [
  ["quote response", process.env.PLAYWRIGHT_QUOTE_RESPONSE_PATH],
  ["official document", process.env.PLAYWRIGHT_DOCUMENT_PATH],
] as const;

const themes = {
  berry: {
    background: "#faf8f5",
    surface: "#ffffff",
    text: "#211c19",
    muted: "#706965",
    border: "#e5dfd9",
    primary: "#792f49",
    hover: "#63263c",
    soft: "#ede0e4",
    onPrimary: "#ffffff",
    accent: "#c89b49",
    accentSoft: "#eee5d4",
    onAccent: "#17120f",
  },
  purple: {
    background: "#fbf8ff",
    surface: "#ffffff",
    text: "#291733",
    muted: "#75677d",
    border: "#e5dbee",
    primary: "#6516a3",
    hover: "#531285",
    soft: "#eee0f7",
    onPrimary: "#ffffff",
    accent: "#c58b20",
    accentSoft: "#f3e6cb",
    onAccent: "#17120f",
  },
  sunrise: {
    background: "#fffaf2",
    surface: "#ffffff",
    text: "#3d230d",
    muted: "#725d4c",
    border: "#eedfc9",
    primary: "#ed5b22",
    hover: "#c63f0a",
    soft: "#fde8dc",
    onPrimary: "#17120f",
    accent: "#e8b915",
    accentSoft: "#f8edc8",
    onAccent: "#17120f",
  },
  "safe-custom": {
    background: "#071e22",
    surface: "#102f36",
    text: "#f7fffb",
    muted: "#c5d9d4",
    border: "#426168",
    primary: "#d7ff00",
    hover: "#b9dc00",
    soft: "#314916",
    onPrimary: "#17120f",
    accent: "#ff4fc8",
    accentSoft: "#542445",
    onAccent: "#17120f",
  },
};

async function settle(page: Page) {
  await expect
    .poll(async () => {
      try {
        await page.waitForLoadState("domcontentloaded");
        if (!(await page.locator("body").isVisible())) return false;
        await page.evaluate(() => document.fonts.ready);
        return true;
      } catch (error) {
        if (page.isClosed()) throw error;
        return false;
      }
    })
    .toBe(true);
  const readyControl = page.locator("[data-ui-ready]");
  if (await readyControl.count()) await expect(readyControl.first()).toHaveAttribute("data-ui-ready", "true");
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate(() =>
          document.documentElement ? document.documentElement.scrollWidth <= window.innerWidth : false,
        );
      } catch (error) {
        if (page.isClosed()) throw error;
        return false;
      }
    })
    .toBe(true);
}

async function applyTheme(page: Page, values: (typeof themes)[keyof typeof themes]) {
  await page.evaluate((tokens) => {
    const root = document.documentElement;
    const pairs = {
      "--color-background": tokens.background,
      "--color-surface": tokens.surface,
      "--color-surface-raised": tokens.surface,
      "--color-text": tokens.text,
      "--color-text-muted": tokens.muted,
      "--color-border": tokens.border,
      "--color-primary": tokens.primary,
      "--color-primary-hover": tokens.hover,
      "--color-primary-soft": tokens.soft,
      "--color-on-primary": tokens.onPrimary,
      "--color-accent": tokens.accent,
      "--color-accent-soft": tokens.accentSoft,
      "--color-on-accent": tokens.onAccent,
      "--color-focus": tokens.primary,
      "--color-feature-surface": tokens.primary,
      "--color-feature-text": tokens.onPrimary,
      "--color-feature-muted": tokens.onPrimary,
    };
    for (const [name, value] of Object.entries(pairs)) root.style.setProperty(name, value);
  }, values);
}

test.describe("responsive customer system", () => {
  for (const route of customerRoutes) {
    test(`${route} has no accidental page overflow`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await settle(page);
      await expectNoPageOverflow(page);
    });
  }

  test("a product detail and its thumbnail rail stay within the viewport", async ({ page }) => {
    await page.goto("/shop");
    const href = await page.locator('a[href^="/product/"]').first().getAttribute("href");
    test.skip(!href, "The isolated catalogue fixture has no product.");
    await page.goto(href as string);
    await settle(page);
    await expectNoPageOverflow(page);
    const mainImage = page.locator(".gallery-main img");
    await expect(mainImage).toHaveCSS("object-fit", "contain");
    const mainImageFrame = await page.locator(".gallery-main").boundingBox();
    expect(mainImageFrame?.width ?? 0).toBeGreaterThan(200);
    const rail = page.locator(".gallery-thumbs");
    if (await rail.count()) await expect(rail).toHaveCSS("max-width", /.+/);
  });

  test("sold-out cards do not show a fake action control", async ({ page }) => {
    await page.goto("/shop");
    await settle(page);
    const soldOutCard = page
      .locator(".product-card")
      .filter({ has: page.locator(".sold-overlay") })
      .first();
    test.skip(!(await soldOutCard.count()), "The isolated catalogue fixture has no sold-out product.");
    await expect(soldOutCard.locator(".round-add")).toHaveCount(0);
  });

  test("mobile navigation traps focus, closes with Escape, and restores focus", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Mobile interaction coverage.");
    await page.goto("/");
    await settle(page);
    const opener = page.getByRole("button", { name: "Open navigation" });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("mobile search and basket use the shared accessible sheet behavior", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Mobile interaction coverage.");
    await page.goto("/");
    await settle(page);

    const searchOpener = page.getByRole("button", { name: "Search" });
    await searchOpener.click();
    const searchDialog = page.getByRole("dialog", { name: "Search products" });
    await expect(searchDialog).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search products" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(searchDialog).toBeHidden();
    await expect(searchOpener).toBeFocused();

    const basketOpener = page.getByRole("button", { name: /Open basket/ });
    await basketOpener.click();
    const basketDialog = page.getByRole("dialog");
    await expect(basketDialog).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-overlay-open", "true");
    await page.keyboard.press("Escape");
    await expect(basketDialog).toBeHidden();
    await expect(basketOpener).toBeFocused();
  });

  test("mobile checkout starts with a compact order summary", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Mobile checkout coverage.");
    await page.goto("/shop");
    await settle(page);
    const quickAdd = page.locator('button[aria-label^="Add "]').first();
    test.skip(!(await quickAdd.count()), "The isolated catalogue fixture has no quick-add product.");
    await quickAdd.click();
    await page.goto("/checkout");
    await settle(page);
    const summary = page.locator("details.checkout-summary");
    await expect(summary).not.toHaveAttribute("open", "");
    await expect(summary.locator(".checkout-summary-content")).toBeHidden();
  });

  test("mobile cake builder keeps its compact price context", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Mobile cake-builder coverage.");
    await page.goto("/custom-cakes/build-your-cake");
    await settle(page);
    await expect(page.locator(".cake-summary-mobile")).toBeVisible();
    await expect(page.locator(".builder-nav")).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("a twelve-thumbnail PDP rail scrolls without widening the page", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Narrow gallery stress coverage.");
    await page.goto("/shop");
    const href = await page.locator('a[href^="/product/"]').first().getAttribute("href");
    test.skip(!href, "The isolated catalogue fixture has no product.");
    await page.goto(href as string);
    await settle(page);
    await page.locator(".gallery").evaluate((gallery) => {
      gallery.querySelector(".gallery-thumbs")?.remove();
      const rail = document.createElement("div");
      rail.className = "gallery-thumbs";
      for (let index = 1; index <= 12; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Preview image ${index}`);
        rail.append(button);
      }
      gallery.append(rail);
    });
    const rail = page.locator(".gallery-thumbs");
    await expect(rail).toHaveCSS("overflow-x", "auto");
    expect(await rail.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    await expectNoPageOverflow(page);
  });

  test("twelve carousel choices collapse to bounded mobile controls", async ({ page }, testInfo) => {
    test.skip((testInfo.project.use.viewport?.width ?? 1440) > 430, "Narrow carousel stress coverage.");
    await page.goto("/");
    await settle(page);
    const controls = page.locator(".carousel-controls").first();
    test.skip(!(await controls.count()), "The isolated storefront fixture has no enabled carousel.");
    await controls.locator("fieldset").evaluate((fieldset) => {
      fieldset.classList.add("many-slides");
      fieldset.replaceChildren();
      for (let index = 1; index <= 12; index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", `Show product ${index}`);
        button.append(document.createElement("span"));
        fieldset.append(button);
      }
    });
    await expect(controls.locator("fieldset")).toBeHidden();
    await expect(controls.locator(".carousel-mobile-position")).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test("owner-managed long copy wraps without widening the page", async ({ page }) => {
    await page.goto("/shop");
    await settle(page);
    await page.locator(".announcement").evaluate((node) => {
      node.textContent =
        "A deliberately long delivery announcement for customers across every configured Canadian service area";
    });
    const title = page.locator(".product-card h3").first();
    if (await title.count()) {
      await title.evaluate((node) => {
        node.textContent = "A very long celebration product name with chocolate, berries, keepsakes and delivery";
      });
    }
    await expectNoPageOverflow(page);
  });

  test("reduced motion disables smooth scrolling and animated transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await page.locator("html").evaluate((node) => getComputedStyle(node).scrollBehavior)).toBe("auto");
  });
});

test.describe("cross-theme visual regression", () => {
  for (const [theme, values] of Object.entries(themes)) {
    test(`${theme} storefront`, async ({ page }) => {
      await page.goto("/shop");
      await settle(page);
      await applyTheme(page, values);
      await expectNoPageOverflow(page);
      await expect(page).toHaveScreenshot(`${theme}-shop.png`, {
        fullPage: true,
        animations: "disabled",
        maxDiffPixelRatio: 0.015,
      });
    });
  }
});

test.describe("accessibility", () => {
  for (const route of ["/", "/shop", "/checkout", "/custom-cakes"]) {
    test(`${route} has no serious axe violations`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")),
      ).toEqual([]);
    });
  }
});

test.describe("public admin entry", () => {
  test("login remains usable without horizontal overflow", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBeLessThan(400);
    await settle(page);
    await expectNoPageOverflow(page);
    await expect(page.getByLabel("Email address")).toBeVisible();
  });

  test("login has no serious axe violations", async ({ page }) => {
    await page.goto("/admin/login");
    await settle(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual(
      [],
    );
  });
});

test.describe("isolated tokenized customer screens", () => {
  for (const [name, route] of tokenizedCustomerRoutes) {
    test(`${name} remains responsive and accessible`, async ({ page }) => {
      test.skip(!route, `Set the isolated ${name} fixture path to enable this check.`);
      const response = await page.goto(route as string);
      expect(response?.status()).toBeLessThan(400);
      await settle(page);
      await expectNoPageOverflow(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")),
      ).toEqual([]);
    });
  }
});

test.describe("authenticated admin responsiveness", () => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE,
    "Requires a session from the isolated admin test environment.",
  );
  for (const route of adminRoutes) {
    test(`${route} has no accidental page overflow`, async ({ page }) => {
      const imageWarnings: string[] = [];
      page.on("console", (message) => {
        if (message.text().includes('parent element with invalid "position"')) imageWarnings.push(message.text());
      });
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await settle(page);
      await expectNoPageOverflow(page);
      if (route === "/admin/carousel") {
        const imageContainer = page.locator(".carousel-preview .carousel-image").first();
        if (await imageContainer.count()) {
          await expect(imageContainer).toHaveCSS("position", "relative");
          await expect(imageContainer).toHaveCSS("display", "block");
          const bounds = await imageContainer.boundingBox();
          expect(bounds?.height).toBeGreaterThan(100);
          expect(imageWarnings).toEqual([]);
        }
      }
    });
  }

  for (const route of ["/admin", "/admin/analytics"]) {
    test(`${route} has no serious axe violations`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? "")),
      ).toEqual([]);
    });
  }
});
