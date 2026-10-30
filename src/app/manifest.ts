import type { MetadataRoute } from "next";

// Lets customers add the shop to their Home Screen, which iPhone needs before it allows
// order notifications.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ndeeelicious Delight",
    short_name: "Ndeeelicious",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#792f49",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
