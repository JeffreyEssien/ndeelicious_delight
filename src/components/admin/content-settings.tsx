"use client";

import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/providers";
import type { StorefrontContent } from "@/types/content";

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | JsonObject | JsonValue[];
type Path = Array<string | number>;

const sectionNames: Record<string, string> = {
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

const labels: Record<string, string> = {
  eyebrow: "Small heading",
  headline: "Main heading",
  supportingText: "Supporting text",
  body: "Body text",
  href: "Link destination",
  primaryHref: "Primary button destination",
  secondaryHref: "Secondary button destination",
  image: "Image URL",
  imageAlt: "Image description",
  linkLabel: "Link label",
  buttonLabel: "Button label",
  primaryLabel: "Primary button label",
  secondaryLabel: "Secondary button label",
  footerDescription: "Footer description",
  newsletterTitle: "Newsletter heading",
  newsletterText: "Newsletter text",
  deliveryTitle: "Delivery heading",
  deliveryText: "Delivery message",
  preparationTitle: "Preparation heading",
  preparationText: "Preparation message",
  updated: "Last updated text",
};

function humanize(value: string) {
  if (labels[value]) return labels[value];
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && !Array.isArray(value);
}

function blankLike(value: JsonValue): JsonValue {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(blankLike);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, blankLike(item)]));
}

function updateAtPath(root: JsonValue, path: Path, replacement: JsonValue): JsonValue {
  if (!path.length) return replacement;
  const [head, ...tail] = path;
  if (Array.isArray(root)) {
    const next = [...root];
    next[Number(head)] = updateAtPath(next[Number(head)], tail, replacement);
    return next;
  }
  if (isObject(root)) return { ...root, [String(head)]: updateAtPath(root[String(head)], tail, replacement) };
  return root;
}

function multilineField(key: string, value: string) {
  return (
    value.length > 90 ||
    ["answer", "body", "description", "footerDescription", "headline", "supportingText"].includes(key)
  );
}

function ContentField({
  name,
  value,
  path,
  onChange,
}: {
  name: string;
  value: JsonValue;
  path: Path;
  onChange: (path: Path, value: JsonValue) => void;
}) {
  if (typeof value === "string") {
    const props = {
      label: humanize(name),
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(path, event.target.value),
    };
    return multilineField(name, value) ? (
      <Textarea {...props} rows={name === "body" || name === "answer" ? 5 : 3} />
    ) : (
      <Input {...props} />
    );
  }
  if (Array.isArray(value)) {
    return (
      <fieldset className="content-array">
        <legend>{humanize(name)}</legend>
        {value.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Content items have no persisted IDs and all inputs are controlled.
          <div className="content-array-item" key={`${name}-${index}`}>
            <ContentField
              name={`${humanize(name)} ${index + 1}`}
              value={item}
              path={[...path, index]}
              onChange={onChange}
            />
            <div className="content-item-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  const next = [...value];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(path, next);
                }}
              >
                Move up
              </button>
              <button
                type="button"
                disabled={index === value.length - 1}
                onClick={() => {
                  const next = [...value];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  onChange(path, next);
                }}
              >
                Move down
              </button>
              <button
                type="button"
                disabled={value.length === 1}
                onClick={() =>
                  onChange(
                    path,
                    value.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {value.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onChange(path, [...value, blankLike(value.at(-1) as JsonValue)])}
          >
            Add {humanize(name).toLowerCase().replace(/s$/, "")}
          </Button>
        )}
      </fieldset>
    );
  }
  return (
    <fieldset className="content-group">
      <legend>{humanize(name)}</legend>
      {Object.entries(value).map(([key, item]) => (
        <ContentField key={key} name={key} value={item} path={[...path, key]} onChange={onChange} />
      ))}
    </fieldset>
  );
}

export function ContentSettings({ initial }: { initial: StorefrontContent }) {
  const [content, setContent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState(Object.keys(initial)[0]);
  const notify = useToast();
  function update(path: Path, value: JsonValue) {
    setContent((current) => updateAtPath(current as JsonObject, path, value) as StorefrontContent);
  }
  async function save() {
    setBusy(true);
    const response = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", key: "content", value: content }),
    });
    setBusy(false);
    if (response.ok) {
      notify("Storefront content is now live.");
      window.location.reload();
    } else {
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Content could not be saved.");
    }
  }
  return (
    <div className="content-settings">
      <div className="admin-card content-settings-intro">
        <div>
          <h2>Customer-facing words and links</h2>
          <p>Edit every storefront section here. Saving makes the changes visible to customers immediately.</p>
        </div>
        <Button disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save all content"}
        </Button>
      </div>
      <div className="content-editor-layout">
        <nav className="admin-card content-page-nav" aria-label="Website pages">
          {Object.keys(content).map((key) => (
            <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}>
              {sectionNames[key] ?? humanize(key)}
            </button>
          ))}
        </nav>
        <section className="admin-card content-section">
          <div className="content-section-heading">
            <span className="overline">Editing</span>
            <h2>{sectionNames[section] ?? humanize(section)}</h2>
            <p>These words and links are shown directly to customers.</p>
          </div>
          <ContentField
            name={section}
            value={content[section as keyof StorefrontContent] as JsonValue}
            path={[section]}
            onChange={update}
          />
        </section>
      </div>
      <div className="admin-save-bar content-save-bar">
        <span>Review your changes, then publish them to the storefront.</span>
        <Button disabled={busy} onClick={save}>
          {busy ? "Publishing…" : "Publish website text"}
        </Button>
      </div>
    </div>
  );
}
