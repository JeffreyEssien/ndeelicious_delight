"use client";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/providers";
import { useUnsavedChanges } from "./use-unsaved-changes";

type Collection = { id: string; parent: string; name: string; sortOrder: number; active: boolean };
const groups = [
  { key: "PASTRIES", label: "Ready to order" },
  { key: "READY_TO_BAKE", label: "Ready to bake" },
  { key: "CUSTOM_CAKES", label: "Custom cakes" },
];

export function CategoriesManager() {
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const notify = useToast();
  useUnsavedChanges(dirty);

  async function reload() {
    const payload = await fetch("/api/admin/collections", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { collections: [] }))
      .catch(() => ({ collections: [] }));
    setItems(payload.collections ?? []);
    setDirty(false);
    setLoading(false);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: load the categories once on mount.
  useEffect(() => {
    void reload();
  }, []);

  const update = (id: string, patch: Partial<Collection>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setDirty(true);
  };
  const add = (parent: string) => {
    setItems((current) => [
      ...current,
      { id: `new-${crypto.randomUUID()}`, parent, name: "", sortOrder: current.filter((c) => c.parent === parent).length, active: true },
    ]);
    setDirty(true);
  };
  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setDirty(true);
  };

  async function save() {
    if (items.some((item) => !item.name.trim())) {
      notify("Give every category a name, or remove the empty one.");
      return;
    }
    setBusy(true);
    const payload = {
      collections: groups.flatMap((group) =>
        items
          .filter((item) => item.parent === group.key)
          .map((item, index) => ({ id: item.id, parent: item.parent, name: item.name.trim(), sortOrder: index, active: item.active })),
      ),
    };
    const response = await fetch("/api/admin/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    setBusy(false);
    if (response.ok) {
      notify("Categories saved.");
      await reload();
    } else {
      notify(result?.error ?? "Categories could not be saved.");
    }
  }

  if (loading) return <p role="status">Loading categories…</p>;
  return (
    <div className="categories-manager">
      <p className="categories-intro">
        Create sub-categories under each group — customers browse by these. The three groups themselves are fixed.
      </p>
      {groups.map((group) => {
        const groupItems = items.filter((item) => item.parent === group.key);
        return (
          <section className="admin-card category-group" key={group.key}>
            <div className="card-head">
              <h2>{group.label}</h2>
              <span>{groupItems.length} sub-categories</span>
            </div>
            {groupItems.map((item) => (
              <div className="category-row" key={item.id}>
                <Input
                  label="Name"
                  value={item.name}
                  placeholder="e.g. Birthday cakes"
                  onChange={(event) => update(item.id, { name: event.target.value })}
                />
                <label className="check-row">
                  <input type="checkbox" checked={item.active} onChange={(event) => update(item.id, { active: event.target.checked })} />
                  <span>Visible</span>
                </label>
                <button type="button" className="text-button danger-text" onClick={() => remove(item.id)}>
                  Delete
                </button>
              </div>
            ))}
            {!groupItems.length && <p className="category-empty">No sub-categories yet.</p>}
            <Button variant="secondary" onClick={() => add(group.key)}>
              Add sub-category
            </Button>
          </section>
        );
      })}
      <div className="admin-save-bar">
        <span>{dirty ? "Unsaved changes" : "All categories saved"}</span>
        <Button disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save categories"}
        </Button>
      </div>
    </div>
  );
}
