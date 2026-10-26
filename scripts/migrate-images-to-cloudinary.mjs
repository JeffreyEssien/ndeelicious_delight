// Copies existing product photos and cake type photos into Cloudinary and points the database at the copies.
// Dry run by default: `npm run images:migrate` lists what would move; add `-- --apply` to copy and update.
// Safe to re-run: rows already on Cloudinary are skipped. Originals in Supabase Storage are left in place.
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { v2 as cloudinary } from "cloudinary";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Set ${missing.join(", ")} first.`);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
  api_key: process.env.CLOUDINARY_API_KEY.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
  secure: true,
});
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const onCloudinary = (url) => typeof url === "string" && url.startsWith("https://res.cloudinary.com/");
const copy = (url, folder) =>
  cloudinary.uploader.upload(url, { folder, resource_type: "image", allowed_formats: ["jpg", "png", "webp", "avif"] });

const report = { project: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0], apply };
const failures = [];

const { data: images, error: imageError } = await db.from("product_images").select("id,product_id,url,storage_path");
if (imageError) throw imageError;
const productImages = images.filter((image) => image.url && !onCloudinary(image.url));
report.productImages = productImages.length;

const { data: cakeTypes, error: cakeError } = await db.from("cake_types").select("id,name,image");
if (cakeError) throw cakeError;
const cakeImages = cakeTypes.filter((type) => type.image && !onCloudinary(type.image));
report.cakeTypeImages = cakeImages.length;

if (apply) {
  for (const image of productImages) {
    try {
      const result = await copy(image.url, `ndee/products/${image.product_id}`);
      const { error } = await db
        .from("product_images")
        .update({ url: result.secure_url, storage_path: `cloudinary:${result.public_id}` })
        .eq("id", image.id);
      if (error) throw error;
    } catch (error) {
      failures.push({ table: "product_images", id: image.id, url: image.url, error: String(error?.message ?? error) });
    }
  }
  for (const type of cakeImages) {
    try {
      const result = await copy(type.image, "ndee/cake-types");
      const { error } = await db.from("cake_types").update({ image: result.secure_url }).eq("id", type.id);
      if (error) throw error;
    } catch (error) {
      failures.push({ table: "cake_types", id: type.id, url: type.image, error: String(error?.message ?? error) });
    }
  }
  report.copied = productImages.length + cakeImages.length - failures.length;
  report.failed = failures;
} else {
  report.note = "Dry run. Re-run with -- --apply to copy these images to Cloudinary.";
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
