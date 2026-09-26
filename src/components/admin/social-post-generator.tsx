"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMoney } from "@/components/providers";
import { Button, Checkbox, Input, Select } from "@/components/ui/primitives";
import type { Product } from "@/types";
import type { StoreCarousel } from "@/types/content";

type SocialSettings = StoreCarousel["social"];
type Dimensions = { width: number; height: number; label: string };

const formats: Record<SocialSettings["format"], Dimensions> = {
  square: { width: 1080, height: 1080, label: "Instagram square · 1080 × 1080" },
  portrait: { width: 1080, height: 1350, label: "Instagram portrait · 1080 × 1350" },
  story: { width: 1080, height: 1920, label: "Story / Reel cover · 1080 × 1920" },
};

const palettes = {
  berry: { background: "#641b78", panel: "#ffffff", ink: "#251d23", accent: "#f1c65b", light: "#fff7fb" },
  cream: { background: "#f3e7dd", panel: "#fffaf6", ink: "#321e29", accent: "#7a2f4a", light: "#7a2f4a" },
  bold: { background: "#f05a1f", panel: "#fff5d9", ink: "#25170f", accent: "#6516a3", light: "#ffffff" },
} as const;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function coverImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  startingSize: number,
  weight = 800,
) {
  let size = startingSize;
  do {
    context.font = `${weight} ${size}px Georgia, serif`;
    if (context.measureText(value).width <= maxWidth) return size;
    size -= 2;
  } while (size > 38);
  return size;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The product image could not be loaded for export."));
    image.src = source;
  });
}

async function renderPost(canvas: HTMLCanvasElement, product: Product, social: SocialSettings, price: string) {
  if (!product.image) throw new Error(`${product.name} needs a product image before it can be exported.`);
  await document.fonts.ready;
  const exportImage = product.image.startsWith("data:")
    ? product.image
    : `/_next/image?url=${encodeURIComponent(product.image)}&w=1920&q=90`;
  const [{ width, height }, productImage, logo] = await Promise.all([
    Promise.resolve(formats[social.format]),
    loadImage(exportImage),
    social.showLogo ? loadImage("/brand-logo.jpg") : Promise.resolve(null),
  ]);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create the social image.");
  canvas.width = width;
  canvas.height = height;
  const palette = palettes[social.template];
  const margin = social.format === "story" ? 76 : 58;
  const footerHeight = social.format === "story" ? 530 : social.format === "portrait" ? 405 : 360;
  const imageBottom = height - footerHeight;

  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  coverImage(context, productImage, 0, 0, width, imageBottom + 60);
  const fade = context.createLinearGradient(0, imageBottom - 260, 0, imageBottom + 70);
  fade.addColorStop(0, "rgba(20, 10, 16, 0)");
  fade.addColorStop(1, "rgba(20, 10, 16, .68)");
  context.fillStyle = fade;
  context.fillRect(0, imageBottom - 260, width, 330);

  if (logo) {
    const logoWidth = social.format === "story" ? 340 : 280;
    const logoHeight = logoWidth * (logo.height / logo.width);
    context.save();
    roundedRect(context, margin, margin, logoWidth, logoHeight, 22);
    context.clip();
    context.drawImage(logo, margin, margin, logoWidth, logoHeight);
    context.restore();
  }

  if (product.badge) {
    context.font = "800 24px Arial, sans-serif";
    const badgeWidth = context.measureText(product.badge.toUpperCase()).width + 54;
    roundedRect(context, width - margin - badgeWidth, margin, badgeWidth, 58, 29);
    context.fillStyle = palette.accent;
    context.fill();
    context.fillStyle = social.template === "berry" ? "#31152b" : "#ffffff";
    context.textAlign = "center";
    context.fillText(product.badge.toUpperCase(), width - margin - badgeWidth / 2, margin + 38);
  }

  const panelY = imageBottom - 16;
  context.fillStyle = palette.panel;
  roundedRect(context, 0, panelY, width, height - panelY + 40, 44);
  context.fill();
  context.textAlign = "left";
  context.fillStyle = palette.accent;
  context.font = "800 24px Arial, sans-serif";
  context.fillText(social.headline.toUpperCase(), margin, panelY + 72);
  context.fillStyle = palette.ink;
  const titleSize = fitText(context, product.name, width - margin * 2, social.format === "story" ? 86 : 72);
  context.font = `800 ${titleSize}px Georgia, serif`;
  context.fillText(product.name, margin, panelY + (social.format === "story" ? 165 : 150));

  if (social.showPrice) {
    context.font = `800 ${social.format === "story" ? 62 : 52}px Arial, sans-serif`;
    context.fillStyle = palette.accent;
    context.fillText(price, margin, panelY + (social.format === "story" ? 255 : 225));
  }

  const footerY = height - (social.format === "story" ? 138 : 104);
  context.strokeStyle = `${palette.ink}30`;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(margin, footerY - 48);
  context.lineTo(width - margin, footerY - 48);
  context.stroke();
  context.fillStyle = palette.ink;
  context.font = "700 26px Arial, sans-serif";
  context.fillText(social.callToAction, margin, footerY);
  context.textAlign = "right";
  context.font = "600 24px Arial, sans-serif";
  context.fillText(social.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""), width - margin, footerY);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function saveCanvas(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The PNG file could not be generated."));
        return;
      }
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
      resolve();
    }, "image/png");
  });
}

export function SocialPostGenerator({
  products,
  settings,
  siteUrl,
  onChange,
  onSave,
}: {
  products: Product[];
  settings: StoreCarousel;
  siteUrl: string;
  onChange: (social: SocialSettings) => void;
  onSave: () => Promise<void>;
}) {
  const selected = useMemo(
    () => settings.productIds.flatMap((id) => products.find((product) => product.id === id) ?? []),
    [products, settings.productIds],
  );
  const [productId, setProductId] = useState(selected[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const money = useMoney();
  const social = useMemo(
    () => ({ ...settings.social, websiteUrl: settings.social.websiteUrl || siteUrl }),
    [settings.social, siteUrl],
  );
  const product = selected.find((item) => item.id === productId) ?? selected[0];
  const update = (value: Partial<SocialSettings>) => onChange({ ...social, ...value });

  useEffect(() => {
    if (!product || !canvas.current) return;
    let cancelled = false;
    renderPost(canvas.current, product, social, money(product.discountPrice ?? product.price))
      .then(() => !cancelled && setMessage(""))
      .catch((error) => !cancelled && setMessage(error instanceof Error ? error.message : "Preview unavailable."));
    return () => {
      cancelled = true;
    };
  }, [money, product, social]);

  async function download(items: Product[]) {
    if (!items.length) return;
    setBusy(true);
    setMessage("Preparing your high-resolution PNG…");
    try {
      for (const item of items) {
        const output = document.createElement("canvas");
        await renderPost(output, item, social, money(item.discountPrice ?? item.price));
        await saveCanvas(output, `${slug(item.name)}-${social.format}.png`);
      }
      setMessage(`${items.length} ${items.length === 1 ? "image" : "images"} downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The images could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card social-generator">
      <div className="card-head">
        <div>
          <h2>Social post generator</h2>
          <p>Create polished, ready-to-post PNGs from the same live products and prices.</p>
        </div>
      </div>
      <div className="social-generator-grid">
        <div className="social-controls">
          <Select label="Product preview" value={product?.id ?? ""} onChange={(e) => setProductId(e.target.value)}>
            {selected.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            label="Post size"
            value={social.format}
            onChange={(e) => update({ format: e.target.value as SocialSettings["format"] })}
          >
            {Object.entries(formats).map(([value, item]) => (
              <option value={value} key={value}>
                {item.label}
              </option>
            ))}
          </Select>
          <Select
            label="Design"
            value={social.template}
            onChange={(e) => update({ template: e.target.value as SocialSettings["template"] })}
          >
            <option value="berry">Signature berry</option>
            <option value="cream">Warm cream</option>
            <option value="bold">Bright celebration</option>
          </Select>
          <Input
            label="Promotional line"
            value={social.headline}
            onChange={(e) => update({ headline: e.target.value })}
          />
          <Input
            label="Call to action"
            value={social.callToAction}
            onChange={(e) => update({ callToAction: e.target.value })}
          />
          <Input
            label="Website shown at the bottom"
            value={social.websiteUrl}
            onChange={(e) => update({ websiteUrl: e.target.value })}
          />
          <div className="social-checks">
            <Checkbox
              label="Show business logo"
              checked={social.showLogo}
              onChange={(e) => update({ showLogo: e.target.checked })}
            />
            <Checkbox
              label="Show live product price"
              checked={social.showPrice}
              onChange={(e) => update({ showPrice: e.target.checked })}
            />
          </div>
          <div className="social-download-actions">
            <Button disabled={busy || !product} onClick={() => product && download([product])}>
              Download this post
            </Button>
            <Button variant="secondary" disabled={busy || !selected.length} onClick={() => download(selected)}>
              Download all {selected.length || ""}
            </Button>
          </div>
          <Button
            variant="ghost"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSave();
              setSaving(false);
            }}
          >
            {saving ? "Saving…" : "Save these design defaults"}
          </Button>
          <p className="social-generator-status" aria-live="polite">
            {message || "PNG exports use the latest product photo and price from the database."}
          </p>
        </div>
        <div className={`social-canvas-wrap social-${social.format}`}>
          {product ? (
            <canvas ref={canvas} aria-label={`Social post preview for ${product.name}`} />
          ) : (
            <p>Select products for the carousel first.</p>
          )}
        </div>
      </div>
    </section>
  );
}
