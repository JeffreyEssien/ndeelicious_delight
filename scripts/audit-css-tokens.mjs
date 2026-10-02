import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve("src");
const runtimeTokens = new Set(["document-accent", "product-columns"]);
const bannedCustomerColours = ["#fdf9fa", "#fcfaf8", "#c4b9b1", "#cbbfb7", "#dedfcf", "#55594b"];
const customerCss = new Set([
  "globals.css",
  "store.css",
  "carousel.css",
  "budget.css",
  "reviews.css",
  "gallery.css",
  "extras.css",
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  });
}

const files = walk(sourceRoot).filter((file) => /\.(css|ts|tsx)$/.test(file));
const definitions = new Set();
const references = new Map();

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) definitions.add(match[1]);
  for (const match of source.matchAll(/var\(--([a-zA-Z0-9_-]+)/g)) {
    const locations = references.get(match[1]) ?? new Set();
    locations.add(path.relative(process.cwd(), file));
    references.set(match[1], locations);
  }
}

const errors = [];
for (const [token, locations] of references) {
  if (!definitions.has(token) && !runtimeTokens.has(token)) {
    errors.push(`Undefined CSS token --${token}: ${[...locations].join(", ")}`);
  }
}

for (const file of files.filter((candidate) => customerCss.has(path.basename(candidate)))) {
  const source = fs.readFileSync(file, "utf8").toLowerCase();
  for (const colour of bannedCustomerColours) {
    if (source.includes(colour))
      errors.push(`Theme-specific raw colour ${colour} in ${path.relative(process.cwd(), file)}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`CSS token audit passed: ${references.size} referenced tokens, 0 undefined.`);
