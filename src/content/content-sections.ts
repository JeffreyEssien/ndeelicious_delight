// Owner-facing names for the parts of the website content, shared by the content editor and the
// image library's "used in" labels.
export const contentSectionNames: Record<string, string> = {
  customerText: "Customer interface and email wording",
  global: "Header, navigation and footer",
  home: "Homepage",
  about: "About page",
  contact: "Contact page",
  customCakes: "Custom cakes page",
  readyToBake: "Ready-to-bake page",
  delivery: "Delivery page",
  faq: "Frequently asked questions",
  headers: "Shop, cart and tracking headers",
  orderSuccess: "Order confirmation",
  product: "Product page messages",
  policies: "Policies",
};

export function humanizeContentKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}
