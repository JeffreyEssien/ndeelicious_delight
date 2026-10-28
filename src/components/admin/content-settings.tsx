"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/providers";
import { ImageUrlField } from "@/components/admin/image-url-field";
import { contentSectionNames, humanizeContentKey } from "@/content/content-sections";
import type { StorefrontContent } from "@/types/content";

type JsonObject = { [key: string]: JsonValue };
type JsonValue = string | JsonObject | JsonValue[];
type Path = Array<string | number>;

const sectionNames = contentSectionNames;

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
  founder: "Meet the founder",
  vision: "Our vision",
  name: "Name",
  role: "Title",
  motto: "Motto",
  lead: "Opening line",
  highlights: "Highlights",
  statement: "Vision statement",
  closing: "Closing line",
  signOff: "Sign-off",
  signature: "Signed by",
  signatureRole: "Signer's title",
};

function humanize(value: string) {
  return labels[value] ?? humanizeContentKey(value);
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
    ["answer", "body", "description", "footerDescription", "headline", "supportingText", "statement", "lead"].includes(
      key,
    )
  );
}

function ContentField({
  name,
  value,
  path,
  onChange,
  hideLegend = false,
}: {
  name: string;
  value: JsonValue;
  path: Path;
  onChange: (path: Path, value: JsonValue) => void;
  hideLegend?: boolean;
}) {
  if (typeof value === "string") {
    if (name === "image")
      return <ImageUrlField label={humanize(name)} value={value} onChange={(url) => onChange(path, url)} />;
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
        {!hideLegend && <legend>{humanize(name)}</legend>}
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

// Each top-level group of a page (hero, categories, …) becomes its own collapsible
// card so the owner focuses on one piece at a time instead of a wall of fields.
function ContentBlock({
  name,
  value,
  path,
  onChange,
  open,
}: {
  name: string;
  value: JsonValue;
  path: Path;
  onChange: (path: Path, value: JsonValue) => void;
  open: boolean;
}) {
  const groupPath = [...path, name];
  return (
    <details className="content-block" open={open}>
      <summary>{humanize(name)}</summary>
      <div className="content-block-body">
        {isObject(value) ? (
          Object.entries(value).map(([key, item]) => (
            <ContentField key={key} name={key} value={item} path={[...groupPath, key]} onChange={onChange} />
          ))
        ) : (
          <ContentField name={name} value={value} path={groupPath} onChange={onChange} hideLegend />
        )}
      </div>
    </details>
  );
}

export function ContentSettings({ initial }: { initial: StorefrontContent }) {
  const [content, setContent] = useState(initial);
  const [wordingGroup, setWordingGroup] = useState(Object.keys(initial.customerText)[0]);
  const [wordingSearch, setWordingSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const [section, setSection] = useState(Object.keys(initial)[0]);
  const notify = useToast();
  const router = useRouter();
  function update(path: Path, value: JsonValue) {
    setContent((current) => updateAtPath(current as JsonObject, path, value) as StorefrontContent);
    setSaveState("unsaved");
  }
  async function save() {
    setBusy(true);
    setSaveState("saving");
    const response = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", key: "content", value: content }),
    });
    setBusy(false);
    if (response.ok) {
      setSaveState("saved");
      notify("Storefront content is now live.");
      router.refresh();
    } else {
      setSaveState("failed");
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Content could not be saved.");
    }
  }
  const dirty = saveState === "unsaved" || saveState === "failed";
  return (
    <div className="content-settings">
      <div className="admin-card content-picker">
        <label className="field">
          <span>Which part of your website do you want to edit?</span>
          <select value={section} onChange={(event) => setSection(event.target.value)}>
            {Object.keys(content).map((key) => (
              <option key={key} value={key}>
                {sectionNames[key] ?? humanize(key)}
              </option>
            ))}
          </select>
        </label>
        <p className="field-hint">Make your edits below, then publish. Changes go live for customers right away.</p>
      </div>
      <section className="admin-card content-section">
        <h2 className="content-section-title">{sectionNames[section] ?? humanize(section)}</h2>
        {section === "customerText" ? (
          <>
            <label className="field">
              <span>Screen or email</span>
              <select value={wordingGroup} onChange={(event) => setWordingGroup(event.target.value)}>
                {Object.keys(content.customerText).map((group) => (
                  <option key={group} value={group}>
                    {humanize(group)}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Search this group"
              placeholder="Find a word or label"
              value={wordingSearch}
              onChange={(event) => setWordingSearch(event.target.value)}
            />
            <p className="field-hint">
              Keep placeholders like {"{value1}"} in the text — they fill in customer and order details automatically.
            </p>
            {Object.entries(content.customerText[wordingGroup] ?? {})
              .filter(([key, value]) => `${key} ${value}`.toLowerCase().includes(wordingSearch.toLowerCase()))
              .map(([key, value]) => (
                <ContentField
                  key={key}
                  name={key}
                  value={value}
                  path={["customerText", wordingGroup, key]}
                  onChange={update}
                />
              ))}
          </>
        ) : isObject(content[section as keyof StorefrontContent] as JsonValue) ? (
          Object.entries(content[section as keyof StorefrontContent] as JsonObject).map(([key, value], index) => (
            <ContentBlock key={key} name={key} value={value} path={[section]} onChange={update} open={index === 0} />
          ))
        ) : (
          <ContentField
            name={section}
            value={content[section as keyof StorefrontContent] as JsonValue}
            path={[section]}
            onChange={update}
          />
        )}
      </section>
      <div className="admin-save-bar content-save-bar">
        <span role="status">
          {saveState === "saved"
            ? "Saved — your website is up to date."
            : saveState === "saving"
              ? "Publishing…"
              : saveState === "failed"
                ? "Couldn’t publish — try again."
                : "You have unsaved changes."}
        </span>
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? "Publishing…" : "Publish changes"}
        </Button>
      </div>
    </div>
  );
}
