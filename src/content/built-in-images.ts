// Images that ship with the site in /public. The image library lists them next to uploaded ones;
// `usedIn` names the places the code itself shows them (uses in saved content are found separately).
// A test keeps this list in step with the files in /public. macOS screenshot names have a narrow
// no-break space before "PM", written here as \u202f.
export type BuiltInImage = { path: string; title: string; usedIn: string[] };

export const builtInImages: BuiltInImage[] = [
  { path: "/landing/full-range.jpg", title: "Ready-to-bake full range", usedIn: ["Homepage hero"] },
  { path: "/landing/chicken-pies.jpg", title: "Chicken pies", usedIn: ["Homepage hero"] },
  { path: "/landing/sausage-rolls.jpg", title: "Beef sausage rolls", usedIn: ["Homepage hero"] },
  { path: "/about/ndidiamaka.jpg", title: "Ndidiamaka, founder and CEO", usedIn: [] },
  { path: "/brand-logo.jpg", title: "Brand logo", usedIn: ["Site header", "Receipts and invoices"] },
  { path: "/hero-bakery.jpg", title: "Bakery table", usedIn: ["Contact page"] },
  { path: "/custom-cake.jpg", title: "Custom cake", usedIn: ["Admin sign-in page"] },
  { path: "/pastries.jpg", title: "Pastries", usedIn: [] },
  { path: "/ready-to-bake.jpg", title: "Ready-to-bake pastries", usedIn: [] },
  { path: "/WhatsApp Image 2026-09-15 at 22.16.43.jpeg", title: "WhatsApp photo", usedIn: [] },
  { path: "/Screenshot 2026-09-15 at 10.27.14\u202fPM.png", title: "Screenshot", usedIn: [] },
  { path: "/Screenshot 2026-09-15 at 10.28.09\u202fPM.png", title: "Screenshot", usedIn: [] },
];
