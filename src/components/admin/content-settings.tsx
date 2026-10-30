"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers";
import { ImageUrlField } from "@/components/admin/image-url-field";
import { Icon } from "@/components/ui/icons";
import {
  contentPages,
  type FieldSpec,
  type ListSpec,
  type PageSpec,
  type SectionSpec,
  sitePages,
  wordingGroupName,
  wordingPage,
} from "@/components/admin/content-editor/spec";
import type { StorefrontContent } from "@/types/content";

type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json };
type Path = Array<string | number>;
type Change = (path: Path, value: Json) => void;

const pathKey = (path: Path) => path.join("›");
const fieldId = (path: Path) => `ce-${path.join("-")}`.replace(/[^\w-]/g, "_");

function getAt(root: Json, path: Path): Json {
  let value = root;
  for (const part of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string | number, Json>)[part];
  }
  return value;
}

function setAt(root: Json, path: Path, replacement: Json): Json {
  if (!path.length) return replacement;
  const [head, ...tail] = path;
  if (Array.isArray(root)) {
    const next = [...root];
    next[Number(head)] = setAt(next[Number(head)], tail, replacement);
    return next;
  }
  const object = root && typeof root === "object" ? root : {};
  return { ...object, [head]: setAt((object as Record<string, Json>)[head], tail, replacement) };
}

// Every piece of text that differs from what is live, by path.
function changes(saved: Json, draft: Json, path: Path = [], found: string[] = []) {
  if (Array.isArray(saved) || Array.isArray(draft)) {
    const a = Array.isArray(saved) ? saved : [];
    const b = Array.isArray(draft) ? draft : [];
    if (a.length !== b.length) found.push(pathKey(path));
    for (let i = 0; i < Math.min(a.length, b.length); i++) changes(a[i], b[i], [...path, i], found);
  } else if ((saved && typeof saved === "object") || (draft && typeof draft === "object")) {
    const a = (saved ?? {}) as Record<string, Json>;
    const b = (draft ?? {}) as Record<string, Json>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) changes(a[key], b[key], [...path, key], found);
  } else if ((saved ?? "") !== (draft ?? "")) found.push(pathKey(path));
  return found;
}

const hasText = (value: Json): boolean =>
  typeof value === "string"
    ? value.trim().length > 0
    : Array.isArray(value)
      ? value.some(hasText)
      : value && typeof value === "object"
        ? Object.values(value).some(hasText)
        : false;

function blankItem(list: ListSpec): Json {
  if (typeof list.fields === "string") return "";
  const item: Record<string, Json> = {};
  for (const field of list.fields) {
    item[field.key] = "";
    if (field.alt) item[field.alt] = "";
  }
  for (const nested of list.lists ?? []) item[nested.key] = [];
  return item;
}

function tooLong(spec: PageSpec[], content: Json) {
  const problems: string[] = [];
  const check = (fields: FieldSpec[], base: Path) => {
    for (const field of fields) {
      const value = getAt(content, [...base, field.key]);
      if (field.max && typeof value === "string" && value.length > field.max) problems.push(field.label);
    }
  };
  const walkList = (list: ListSpec, base: Path) => {
    const items = getAt(content, [...base, list.key]);
    if (!Array.isArray(items)) return;
    items.forEach((_, index) => {
      if (typeof list.fields !== "string") check(list.fields, [...base, list.key, index]);
      for (const nested of list.lists ?? []) walkList(nested, [...base, list.key, index]);
    });
  };
  for (const page of spec)
    for (const section of page.sections) {
      const base = section.key ? [page.key, section.key] : [page.key];
      check(section.fields ?? [], base);
      for (const list of section.lists ?? []) walkList(list, base);
    }
  return problems;
}

function Field({
  spec,
  path,
  value,
  saved,
  altValue,
  onChange,
}: {
  spec: FieldSpec;
  path: Path;
  value: Json;
  saved: Json;
  altValue?: Json;
  onChange: Change;
}) {
  const text = typeof value === "string" ? value : "";
  const edited = text !== (typeof saved === "string" ? saved : "");
  const over = spec.max ? text.length > spec.max : false;
  const id = fieldId(path);
  const meta = (
    <span className="ce-meta">
      {edited && (
        <button type="button" className="ce-undo" onClick={() => onChange(path, saved ?? "")}>
          Undo
        </button>
      )}
      {spec.max && (spec.kind === "long" || text.length > spec.max * 0.8) && (
        <span className={over ? "is-over" : undefined}>
          {text.length}/{spec.max}
        </span>
      )}
    </span>
  );
  if (spec.kind === "image") {
    const altPath = spec.alt ? [...path.slice(0, -1), spec.alt] : null;
    return (
      <div className={`ce-field is-wide${edited ? " is-edited" : ""}`} id={id}>
        <ImageUrlField
          label={spec.label}
          value={text}
          onChange={(url) => onChange(path, url)}
          onChooseItem={(item) => {
            if (altPath && !altValue && item.altText) onChange(altPath, item.altText);
          }}
        />
        {altPath && (
          <label className="ce-input">
            <span className="ce-label">
              Describe the photo
              <small>Read out to people using screen readers, and used by Google.</small>
            </span>
            <input
              value={typeof altValue === "string" ? altValue : ""}
              maxLength={300}
              onChange={(event) => onChange(altPath, event.target.value)}
            />
          </label>
        )}
      </div>
    );
  }
  return (
    <div className={`ce-field ce-input${spec.kind === "long" ? " is-wide" : ""}${edited ? " is-edited" : ""}`}>
      <span className="ce-label">
        <label htmlFor={id}>{spec.label}</label>
        {meta}
        {spec.hint && <small>{spec.hint}</small>}
      </span>
      {spec.kind === "long" ? (
        <textarea
          id={id}
          value={text}
          aria-invalid={over}
          rows={Math.min(12, Math.max(3, Math.ceil(text.length / 80) + text.split("\n").length - 1))}
          onChange={(event) => onChange(path, event.target.value)}
        />
      ) : (
        <span className="ce-inline">
          <input
            id={id}
            value={text}
            aria-invalid={over}
            list={spec.kind === "link" ? "ce-site-pages" : undefined}
            placeholder={spec.kind === "link" ? "Pick a page or paste a link" : undefined}
            onChange={(event) => onChange(path, event.target.value)}
          />
          {spec.kind === "link" && text && (
            <a href={text} target="_blank" rel="noreferrer" className="ce-test" aria-label="Open this link">
              <Icon name="arrow" />
            </a>
          )}
        </span>
      )}
    </div>
  );
}

function Fields({
  fields,
  base,
  content,
  saved,
  onChange,
}: {
  fields: FieldSpec[];
  base: Path;
  content: Json;
  saved: Json;
  onChange: Change;
}) {
  return (
    <div className="ce-fields">
      {fields.map((field) => (
        <Field
          key={field.key}
          spec={field}
          path={[...base, field.key]}
          value={getAt(content, [...base, field.key])}
          saved={getAt(saved, [...base, field.key])}
          altValue={field.alt ? getAt(content, [...base, field.alt]) : undefined}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function ListEditor({
  list,
  base,
  content,
  saved,
  onChange,
}: {
  list: ListSpec;
  base: Path;
  content: Json;
  saved: Json;
  onChange: Change;
}) {
  const path = [...base, list.key];
  const raw = getAt(content, path);
  const items = Array.isArray(raw) ? raw : [];
  const [open, setOpen] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(path, next);
    setOpen(to);
  };
  const plain = typeof list.fields === "string";
  return (
    <div className="ce-list">
      <div className="ce-list-head">
        <b>{list.label}</b>
        <small>
          {items.length} of up to {list.max}
          {list.hint ? ` · ${list.hint}` : ""}
        </small>
      </div>
      {items.map((item, index) => {
        const itemPath = [...path, index];
        const titleValue = plain ? item : list.title ? getAt(item, [list.title]) : "";
        const title = typeof titleValue === "string" && titleValue.trim() ? titleValue : `New ${list.item}`;
        const actions = (
          <span className="ce-item-actions">
            <button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Move up">
              <Icon name="chevron" />
            </button>
            <button
              type="button"
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
              aria-label="Move down"
            >
              <Icon name="chevron" />
            </button>
            <button
              type="button"
              disabled={items.length >= list.max}
              onClick={() => {
                onChange(path, [...items.slice(0, index + 1), structuredClone(item), ...items.slice(index + 1)]);
                setOpen(index + 1);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                if (hasText(item) && !window.confirm(`Remove this ${list.item}?`)) return;
                onChange(
                  path,
                  items.filter((_, i) => i !== index),
                );
                setOpen(null);
              }}
            >
              Remove
            </button>
          </span>
        );
        if (plain)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: List items have no saved IDs; position is their identity.
            <div className="ce-item is-plain" key={`${pathKey(path)}-${index}`}>
              <span className="ce-item-number">{index + 1}</span>
              <Field
                spec={{
                  key: String(index),
                  label: `${list.item[0].toUpperCase()}${list.item.slice(1)} ${index + 1}`,
                  kind: list.fields as "text" | "long",
                  max: 2000,
                }}
                path={itemPath}
                value={item}
                saved={getAt(saved, itemPath)}
                onChange={onChange}
              />
              {actions}
            </div>
          );
        return (
          <details
            className="ce-item"
            // biome-ignore lint/suspicious/noArrayIndexKey: List items have no saved IDs; position is their identity.
            key={`${pathKey(path)}-${index}`}
            open={open === index}
            onToggle={(event) => {
              if ((event.target as HTMLDetailsElement).open) setOpen(index);
              else if (open === index) setOpen(null);
            }}
          >
            <summary>
              <span className="ce-item-number">{index + 1}</span>
              <span className="ce-item-title">{title}</span>
              <Icon name="chevron" />
            </summary>
            <div className="ce-item-body">
              <Fields
                fields={list.fields as FieldSpec[]}
                base={itemPath}
                content={content}
                saved={saved}
                onChange={onChange}
              />
              {list.lists?.map((nested) => (
                <ListEditor
                  key={nested.key}
                  list={nested}
                  base={itemPath}
                  content={content}
                  saved={saved}
                  onChange={onChange}
                />
              ))}
              {actions}
            </div>
          </details>
        );
      })}
      <button
        type="button"
        className="ce-add"
        disabled={items.length >= list.max}
        onClick={() => {
          onChange(path, [...items, blankItem(list)]);
          setOpen(items.length);
        }}
      >
        <Icon name="plus" /> Add {list.item}
      </button>
    </div>
  );
}

function Section({
  page,
  section,
  content,
  saved,
  edits,
  open,
  onToggle,
  onChange,
}: {
  page: PageSpec;
  section: SectionSpec;
  content: Json;
  saved: Json;
  edits: string[];
  open: boolean;
  onToggle: (open: boolean) => void;
  onChange: Change;
}) {
  const base = section.key ? [page.key, section.key] : [page.key];
  const keys = [
    ...(section.fields ?? []).flatMap((field) => [field.key, field.alt].filter(Boolean)),
    ...(section.lists ?? []).map((list) => list.key),
  ].map((key) => pathKey([...base, key as string]));
  const count = edits.filter((edit) => keys.some((key) => edit === key || edit.startsWith(`${key}›`))).length;
  return (
    <details
      className="ce-section"
      open={open}
      onToggle={(event) => onToggle((event.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span>
          <b>{section.label}</b>
          <small>{section.where}</small>
        </span>
        {count > 0 && <em>{count} edited</em>}
        <Icon name="chevron" />
      </summary>
      <div className="ce-section-body">
        {section.fields && (
          <Fields fields={section.fields} base={base} content={content} saved={saved} onChange={onChange} />
        )}
        {section.lists?.map((list) => (
          <ListEditor key={list.key} list={list} base={base} content={content} saved={saved} onChange={onChange} />
        ))}
      </div>
    </details>
  );
}

function Wording({
  content,
  saved,
  onChange,
  focusGroup,
}: {
  content: Json;
  saved: Json;
  onChange: Change;
  focusGroup?: string;
}) {
  const groups = Object.keys((getAt(content, ["customerText"]) as Record<string, Json>) ?? {}).sort((a, b) =>
    wordingGroupName(a).localeCompare(wordingGroupName(b)),
  );
  const [group, setGroup] = useState(focusGroup ?? (groups.includes("emails") ? "emails" : groups[0]));
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (focusGroup) setGroup(focusGroup);
  }, [focusGroup]);
  const entries = Object.entries((getAt(content, ["customerText", group]) as Record<string, string>) ?? {}).filter(
    ([key, value]) => `${key} ${value}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="ce-wording">
      <div className="ce-wording-bar">
        <label className="ce-input">
          <span className="ce-label">Screen or email</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            {groups.map((item) => (
              <option key={item} value={item}>
                {wordingGroupName(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="ce-input">
          <span className="ce-label">Find in this screen</span>
          <input value={query} placeholder="A word or phrase" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <p className="ce-note">
        Words in curly brackets, like {"{name}"}, fill in automatically. Keep them in your text.
      </p>
      <div className="ce-wording-list">
        {entries.map(([key, value]) => {
          const path = ["customerText", group, key];
          const changedFromOriginal = value !== key;
          return (
            <div className="ce-wording-row" key={key}>
              <Field
                spec={{ key, label: key, kind: key.length > 70 ? "long" : "text" }}
                path={path}
                value={value}
                saved={getAt(saved, path)}
                onChange={onChange}
              />
              {changedFromOriginal && (
                <button type="button" className="ce-undo" onClick={() => onChange(path, key)}>
                  Use original
                </button>
              )}
            </div>
          );
        })}
        {!entries.length && <p className="ce-note">Nothing matches “{query}”.</p>}
      </div>
    </div>
  );
}

function UnpublishedDot() {
  return (
    <i className="ce-dot">
      <span className="sr-only">Has unpublished changes</span>
    </i>
  );
}

type Hit = { page: PageSpec; section?: SectionSpec; group?: string; label: string; value: string; path: Path };

// Every editable piece of text, for the search box.
function searchIndex(content: Json) {
  const hits: Hit[] = [];
  const addFields = (page: PageSpec, section: SectionSpec, fields: FieldSpec[], base: Path, prefix = "") => {
    for (const field of fields) {
      const value = getAt(content, [...base, field.key]);
      if (field.kind !== "image" && typeof value === "string")
        hits.push({ page, section, label: `${prefix}${field.label}`, value, path: [...base, field.key] });
    }
  };
  const addList = (page: PageSpec, section: SectionSpec, list: ListSpec, base: Path) => {
    const items = getAt(content, [...base, list.key]);
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
      const prefix = `${list.item[0].toUpperCase()}${list.item.slice(1)} ${index + 1} › `;
      if (typeof list.fields === "string") {
        if (typeof item === "string")
          hits.push({ page, section, label: prefix.slice(0, -3), value: item, path: [...base, list.key, index] });
      } else addFields(page, section, list.fields, [...base, list.key, index], prefix);
      for (const nested of list.lists ?? []) addList(page, section, nested, [...base, list.key, index]);
    });
  };
  for (const page of contentPages)
    for (const section of page.sections) {
      const base = section.key ? [page.key, section.key] : [page.key];
      addFields(page, section, section.fields ?? [], base);
      for (const list of section.lists ?? []) addList(page, section, list, base);
    }
  const wording = (getAt(content, ["customerText"]) as Record<string, Record<string, string>>) ?? {};
  for (const [group, entries] of Object.entries(wording))
    for (const [key, value] of Object.entries(entries))
      hits.push({
        page: wordingPage,
        group,
        label: wordingGroupName(group),
        value: value || key,
        path: ["customerText", group, key],
      });
  return hits;
}

export function ContentSettings({ initial }: { initial: StorefrontContent }) {
  const [saved, setSaved] = useState<Json>(initial as unknown as Json);
  const [draft, setDraft] = useState<Json>(initial as unknown as Json);
  const [pageKey, setPageKey] = useState(contentPages[0].key);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ [`${contentPages[0].key}:0`]: true });
  const [query, setQuery] = useState("");
  const [wordingGroup, setWordingGroup] = useState<string>();
  const [publishing, setPublishing] = useState(false);
  const notify = useToast();
  const router = useRouter();

  const edits = useMemo(() => changes(saved, draft), [saved, draft]);
  const editsOn = (key: string) => edits.filter((edit) => edit === key || edit.startsWith(`${key}›`)).length;
  const page =
    pageKey === wordingPage.key ? wordingPage : (contentPages.find((item) => item.key === pageKey) ?? contentPages[0]);
  const hits = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (words.length < 2) return [];
    return searchIndex(draft)
      .filter((hit) => `${hit.label} ${hit.value}`.toLowerCase().includes(words))
      .slice(0, 30);
  }, [draft, query]);

  const update: Change = (path, value) => setDraft((current) => setAt(current, path, value));

  async function publish() {
    if (publishing || !edits.length) return;
    const problems = tooLong(contentPages, draft);
    if (problems.length) {
      notify(`Shorten ${problems.length === 1 ? `“${problems[0]}”` : `${problems.length} fields`} before publishing.`);
      return;
    }
    setPublishing(true);
    const response = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", key: "content", value: draft }),
    });
    setPublishing(false);
    if (response.ok) {
      setSaved(draft);
      notify("Published. Your website is up to date.");
      router.refresh();
    } else {
      const payload = await response.json().catch(() => null);
      notify(payload?.error ?? "Could not publish. Check your changes and try again.");
    }
  }

  // Cmd/Ctrl+S publishes, and leaving with unpublished changes asks first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: publish reads the latest draft each render.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        publish();
      }
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (edits.length) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [edits.length, draft]);

  function go(hit: Hit) {
    setQuery("");
    setPageKey(hit.page.key);
    if (hit.group) setWordingGroup(hit.group);
    if (hit.section) {
      const index = hit.page.sections.indexOf(hit.section);
      setOpenSections((current) => ({ ...current, [`${hit.page.key}:${index}`]: true }));
    }
    setTimeout(() => {
      const element = document.getElementById(fieldId(hit.path));
      const details = element?.closest("details.ce-item") as HTMLDetailsElement | null;
      if (details) details.open = true;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      (element as HTMLElement | null)?.focus?.({ preventScroll: true });
    }, 60);
  }

  const groups: Array<[PageSpec["group"], string]> = [
    ["pages", "Pages"],
    ["site", "Across the site"],
  ];

  return (
    <div className="ce">
      <datalist id="ce-site-pages">
        {sitePages.map(([href, name]) => (
          <option key={href} value={href}>
            {name}
          </option>
        ))}
      </datalist>
      <div className="ce-search">
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find any text on your website"
          aria-label="Find any text on your website"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
            <Icon name="close" />
          </button>
        )}
        {query.trim().length >= 2 && (
          <div className="ce-results">
            {hits.length ? (
              hits.map((hit) => (
                <button type="button" key={pathKey(hit.path)} onClick={() => go(hit)}>
                  <small>
                    {hit.page.label}
                    {hit.section ? ` › ${hit.section.label}` : hit.group ? ` › ${hit.label}` : ""}
                    {hit.section ? ` › ${hit.label}` : ""}
                  </small>
                  <span>{hit.value || "(empty)"}</span>
                </button>
              ))
            ) : (
              <p>No text matches “{query}”.</p>
            )}
          </div>
        )}
      </div>

      <div className="ce-layout">
        <nav className="ce-nav" aria-label="Website parts">
          {groups.map(([group, title]) => (
            <div key={group}>
              <span className="ce-nav-title">{title}</span>
              {contentPages
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    aria-current={item.key === pageKey ? "page" : undefined}
                    onClick={() => setPageKey(item.key)}
                  >
                    <span>{item.label}</span>
                    {editsOn(item.key) > 0 && <UnpublishedDot />}
                  </button>
                ))}
            </div>
          ))}
          <div>
            <span className="ce-nav-title">Wording</span>
            <button
              type="button"
              aria-current={pageKey === wordingPage.key ? "page" : undefined}
              onClick={() => setPageKey(wordingPage.key)}
            >
              <span>{wordingPage.label}</span>
              {editsOn("customerText") > 0 && <UnpublishedDot />}
            </button>
          </div>
        </nav>

        <section className="ce-page">
          <header className="ce-page-head">
            <div>
              <h2>{page.label}</h2>
              <p>{page.description}</p>
            </div>
            <div>
              {editsOn(page.key) > 0 && (
                <button
                  type="button"
                  className="ce-ghost"
                  onClick={() => update([page.key], structuredClone(getAt(saved, [page.key])))}
                >
                  Undo changes here
                </button>
              )}
              {page.href && (
                <a className="ce-ghost" href={page.href} target="_blank" rel="noreferrer">
                  View page <Icon name="arrow" />
                </a>
              )}
            </div>
          </header>
          {page.key === wordingPage.key ? (
            <Wording content={draft} saved={saved} onChange={update} focusGroup={wordingGroup} />
          ) : (
            page.sections.map((section, index) => (
              <Section
                key={`${page.key}-${section.label}`}
                page={page}
                section={section}
                content={draft}
                saved={saved}
                edits={edits}
                open={openSections[`${page.key}:${index}`] ?? false}
                onToggle={(open) => setOpenSections((current) => ({ ...current, [`${page.key}:${index}`]: open }))}
                onChange={update}
              />
            ))
          )}
        </section>
      </div>

      <div className={`ce-bar${edits.length ? " is-dirty" : ""}`}>
        <span role="status">
          {edits.length
            ? `${edits.length} unpublished ${edits.length === 1 ? "change" : "changes"}`
            : "Everything is published"}
          <small>
            {edits.length ? "Customers see the old text until you publish." : "Your website matches what you see here."}
          </small>
        </span>
        <div>
          {edits.length > 0 && (
            <button
              type="button"
              className="ce-ghost"
              onClick={() => {
                if (window.confirm("Throw away all unpublished changes?")) setDraft(saved);
              }}
            >
              Discard all
            </button>
          )}
          <button type="button" className="ce-publish" disabled={!edits.length || publishing} onClick={publish}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
