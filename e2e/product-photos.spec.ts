import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  test.skip(process.env.NDEE_BROWSER_FIXTURES !== "true", "Isolated local fixtures only.");
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100");
  expect(["localhost", "127.0.0.1"]).toContain(origin.hostname);
  const payload = `fixture-token.${Math.floor(Date.now() / 1000) + 3600}`;
  const signature = createHmac("sha256", "isolated-ndee-browser-secret-32-characters")
    .update(`cookie:${payload}`)
    .digest("hex");
  await context.addCookies([
    { name: "ndee_admin_session", value: `${payload}.${signature}`, url: origin.origin, httpOnly: true },
  ]);
  await page.request.post("http://127.0.0.1:4545/__fixtures/reset");
  await page.route("**/api/analytics/events", (route) => route.fulfill({ status: 204 }));
});

test("a large phone photo is shrunk, previewed and saved without asking for a description", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/admin/products");
  const row = page.locator("tr").filter({ hasText: "Classic Butter Croissant" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });

  // A 4000×3000 photo full of detail is far over the old 4 MB limit as a high-quality JPEG.
  const originalBytes = await editor.getByLabel("Add photos").evaluate(async (input: HTMLInputElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = 4000;
    canvas.height = 3000;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const pixels = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = (i * 2654435761) % 251;
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.95));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "IMG_0042.JPG", { type: "image/jpeg" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  expect(originalBytes).toBeGreaterThan(5 * 1024 * 1024);

  const preview = editor.locator(".pending-image img");
  await expect(preview).toBeVisible();
  await expect(editor.locator(".pending-image").getByLabel("Photo description (optional)")).toHaveValue("");
  await expect(editor.getByRole("alert")).toHaveCount(0);

  const commit = page.waitForRequest((request) => request.url().endsWith("/api/admin/products/images"));
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  const { publicId, altText } = (await commit).postDataJSON();
  expect(altText).toBe("Classic Butter Croissant");
  await expect(editor).toBeHidden();
  await expect(page.getByText("Product saved.", { exact: false })).toBeVisible();

  // The photo went straight to (the stand-in for) Cloudinary, already shrunk below the 5 MB limit.
  const stored = await (await page.request.get("http://127.0.0.1:4545/__fixtures/cloudinary")).json();
  const object = stored.find((image: { public_id: string }) => image.public_id === publicId);
  expect(publicId).toMatch(/^ndee\/products\//);
  expect(["webp", "jpg"]).toContain(object.format);
  expect(object.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
});

test("an unreadable file explains what to do instead of failing on save", async ({ page }) => {
  await page.goto("/admin/products");
  const row = page.locator("tr").filter({ hasText: "Classic Butter Croissant" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit Classic Butter Croissant" });
  await editor.getByLabel("Add photos").setInputFiles({
    name: "IMG_0043.HEIC",
    mimeType: "image/heic",
    buffer: Buffer.from("not a browser-readable image"),
  });
  await expect(editor.getByRole("alert")).toContainText("IMG_0043.HEIC could not be read");
  await expect(editor.locator(".pending-image")).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
});

test("a failed photo keeps the saved product and retries only that photo", async ({ page }) => {
  await page.goto("/admin/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add product", exact: true });
  await editor.getByLabel("Product name").fill("Fixture Lemon Tart");
  await editor.getByLabel("Short description").fill("Bright lemon curd tart.");
  await editor.getByLabel("Full description").fill("Buttery pastry filled with lemon curd.");
  await editor.getByLabel("Add photos").setInputFiles({
    name: "tart.png",
    mimeType: "image/png",
    // 1×1 PNG: small enough to upload unchanged.
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(editor.locator(".pending-image img")).toBeVisible();

  await page.route("**/api/admin/products/images", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Storage is unavailable."}' }),
  );
  await editor.getByRole("button", { name: "Create product", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Product saved, but 1 photo was not uploaded.");
  await expect(editor.getByRole("alert")).toContainText("Storage is unavailable.");
  await expect(editor.getByRole("heading", { name: "Edit product" })).toBeVisible();
  await expect(editor.locator(".pending-image")).toHaveCount(1);

  await page.unroute("**/api/admin/products/images");
  const creates: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/admin/products")) creates.push(request.url());
  });
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(creates).toHaveLength(0);
});
