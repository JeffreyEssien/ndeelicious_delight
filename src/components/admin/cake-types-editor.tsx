"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cakeTypesSchema, type CakeType } from "@/validations/cake-type";
export function CakeTypesEditor({ initial }: { initial: CakeType[] }) {
  const [types, setTypes] = useState(initial);
  const [state, setState] = useState("Saved");
  const [error, setError] = useState("");
  const router = useRouter();
  const busy = state === "Saving…";
  function update(id: string, patch: Partial<CakeType>) {
    const current = types.find((type) => type.id === id);
    const slugify = (name: string) =>
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (patch.name !== undefined && current && (!current.slug || current.slug === slugify(current.name)))
      patch = { ...patch, slug: slugify(patch.name) };
    setTypes((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setState("Unsaved changes");
    setError("");
  }
  function move(index: number, offset: number) {
    const next = [...types];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTypes(next.map((type, sortOrder) => ({ ...type, sortOrder })));
    setState("Unsaved changes");
  }
  async function save() {
    const parsed = cakeTypesSchema.safeParse(types);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setState("Error");
      return;
    }
    setState("Saving…");
    setError("");
    try {
      const response = await fetch("/api/admin/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cake-types", cakeTypes: parsed.data }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Cake types could not be saved.");
      setState("Saved");
      router.refresh();
    } catch (reason) {
      setState("Error");
      setError(reason instanceof Error ? reason.message : "Save failed. Please retry.");
    }
  }
  return (
    <section className="admin-card cake-types-editor">
      <h2>Cake types &amp; lead times</h2>
      <p>Set preparation time for every cake type before activating it.</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        {types.map((type, index) => (
          <article className="admin-card form-stack" key={type.id}>
            <label>
              Name
              <input value={type.name} onChange={(e) => update(type.id, { name: e.target.value })} />
            </label>
            <label>
              URL slug
              <input value={type.slug} onChange={(e) => update(type.id, { slug: e.target.value })} />
            </label>
            <label>
              Description
              <textarea value={type.description} onChange={(e) => update(type.id, { description: e.target.value })} />
            </label>
            <label>
              Lead time
              <input
                type="number"
                min={type.active ? "0.01" : "0"}
                step="any"
                required={type.active}
                value={type.leadTimeValue}
                onChange={(e) => update(type.id, { leadTimeValue: Number(e.target.value) })}
              />
            </label>
            <label>
              Lead-time unit
              <select
                value={type.leadTimeUnit}
                onChange={(e) => update(type.id, { leadTimeUnit: e.target.value as CakeType["leadTimeUnit"] })}
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </select>
            </label>
            <label>
              Customer notice
              <textarea
                value={type.customerNotice}
                onChange={(e) => update(type.id, { customerNotice: e.target.value })}
              />
            </label>
            <label>
              Image URL
              <input value={type.image} onChange={(e) => update(type.id, { image: e.target.value })} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={type.active}
                onChange={(e) => update(type.id, { active: e.target.checked })}
              />{" "}
              Active
            </label>
            <div>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                Move up
              </button>{" "}
              <button type="button" disabled={index === types.length - 1} onClick={() => move(index, 1)}>
                Move down
              </button>
            </div>
          </article>
        ))}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setTypes((items) => [
              ...items,
              {
                id: crypto.randomUUID(),
                name: "",
                slug: "",
                description: "",
                leadTimeValue: 0,
                leadTimeUnit: "days",
                active: false,
                sortOrder: items.length,
                image: "",
                customerNotice: "",
              },
            ]);
            setState("Unsaved changes");
          }}
        >
          Add cake type
        </button>
        <button type="button" className="button button-primary" onClick={save}>
          Save cake types
        </button>
      </fieldset>
      <p role="status">{state}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
