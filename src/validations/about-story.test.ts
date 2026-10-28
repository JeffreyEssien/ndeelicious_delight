import fs from "node:fs";
import { describe, expect, it } from "vitest";
import aboutStory from "@/content/about-story.json";
import { storefrontContentSchema } from "./settings";

const migration = (name: string) => fs.readFileSync(`db/migrations/${name}`, "utf8");
// The content the site launched with, before the founder and vision sections existed.
const launchContent = () =>
  JSON.parse(migration("0006_database_backed_storefront.sql").match(/\$content\$([\s\S]*?)\$content\$/)?.[1] ?? "");

describe("Our Story content", () => {
  it("fills in the founder's own words for content saved before the new sections", () => {
    const content = launchContent();
    expect(content.about.founder).toBeUndefined();
    const parsed = storefrontContentSchema.parse(content);
    expect(parsed.about.founder).toEqual(aboutStory.founder);
    expect(parsed.about.vision).toEqual(aboutStory.vision);
    // Each parse gets its own copy, so editing one never changes the built-in text.
    parsed.about.founder.paragraphs.push("Edited");
    expect(storefrontContentSchema.parse(launchContent()).about.founder).toEqual(aboutStory.founder);
  });

  it("keeps edits the owner has saved", () => {
    const content = launchContent();
    content.about.founder = { ...aboutStory.founder, headline: "Meet our founder" };
    expect(storefrontContentSchema.parse(content).about.founder.headline).toBe("Meet our founder");
  });

  it("writes exactly the built-in text in the migration", () => {
    const sql = migration("0051_about_founder_and_vision.sql");
    const blocks = [...sql.matchAll(/\$about\$([\s\S]*?)\$about\$/g)].map((match) => JSON.parse(match[1]));
    expect(blocks).toEqual([aboutStory.hero, aboutStory.founder, aboutStory.vision]);
  });
});
