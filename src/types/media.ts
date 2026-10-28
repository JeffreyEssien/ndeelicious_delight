// Where an image in the admin image library comes from.
// library: uploaded to the library itself; product / cake: a product or cake photo;
// content: only referenced from website content; built-in: ships with the site in /public.
export type MediaSource = "library" | "product" | "cake" | "content" | "built-in";

export type MediaUsage = { label: string; href?: string };

export type MediaItem = {
  /** The library row id for uploaded images; a stable key for everything else. */
  id: string;
  /** The link as the site uses it. Built-in images are site-relative ("/landing/…"). */
  url: string;
  title: string;
  altText: string;
  source: MediaSource;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  createdAt?: string;
  usedIn: MediaUsage[];
};
