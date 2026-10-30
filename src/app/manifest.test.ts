import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import manifest from "./manifest";

// Next serves app/icon.png at /icon.png; /icon only exists for icons generated in code.
it("points every Home Screen icon at a file that exists", () => {
  for (const icon of manifest().icons ?? []) {
    expect(fs.existsSync(path.join(__dirname, icon.src))).toBe(true);
  }
});

it("gives push notifications an icon that exists", () => {
  const worker = fs.readFileSync(path.join(__dirname, "../../public/sw.js"), "utf8");
  for (const [, src] of worker.matchAll(/(?:icon|badge): "([^"]+)"/g))
    expect(fs.existsSync(path.join(__dirname, src))).toBe(true);
});
