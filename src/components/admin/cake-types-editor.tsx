"use client";
import Image from "next/image";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cakeTypesSchema, type CakeType } from "@/validations/cake-type";
import { ConfirmDialog } from "./confirm-dialog";
import { MediaPicker } from "./media-library";
export function CakeTypesEditor({
  initial,
  options,
  relationships,
}: {
  initial: CakeType[];
  options: import("@/types/content").CakeOption[];
  relationships: { cakeTypeId: string; optionId: string }[];
}) {
  const [assignments, setAssignments] = useState(relationships);
  const [types, setTypes] = useState(initial);
  const [collections, setCollections] = useState<{ id: string; parent: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/collections", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { collections: [] }))
      .then((payload) =>
        setCollections((payload.collections ?? []).filter((c: { parent: string }) => c.parent === "CUSTOM_CAKES")),
      )
      .catch(() => {});
  }, []);
  const [expandedCake, setExpandedCake] = useState("");
  // The cake whose photo is being picked from the image library.
  const [pickingPhotoFor, setPickingPhotoFor] = useState("");
  const [savedTypes, setSavedTypes] = useState(initial);
  const [savedAssignments, setSavedAssignments] = useState(relationships);
  const [state, setState] = useState("Saved");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CakeType | null>(null);
  const router = useRouter();
  const busy = state === "Saving…" || uploading;
  useUnsavedChanges(state !== "Saved");
  function update(id: string, patch: Partial<CakeType>) {
    const current = types.find((type) => type.id === id);
    const slugify = (name: string) =>
      name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
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
  async function uploadPhoto(id: string, file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/cakes/photo", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Photo upload failed.");
      update(id, { image: payload.url });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo upload failed. Please retry.");
    } finally {
      setUploading(false);
    }
  }
  function forgetCake(id: string) {
    setTypes((items) => items.filter((item) => item.id !== id));
    setAssignments((links) => links.filter((link) => link.cakeTypeId !== id));
    if (expandedCake === id) setExpandedCake("");
  }
  function requestDelete(type: CakeType) {
    // An unsaved draft never reached the server — just drop it, no confirmation needed.
    if (!savedTypes.some((item) => item.id === type.id)) {
      forgetCake(type.id);
      return;
    }
    setDeleteTarget(type);
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const type = deleteTarget;
    setState("Saving…");
    setError("");
    try {
      const response = await fetch("/api/admin/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cake-delete", id: type.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "The cake could not be removed.");
      forgetCake(type.id);
      setSavedTypes((items) => items.filter((item) => item.id !== type.id));
      setSavedAssignments((links) => links.filter((link) => link.cakeTypeId !== type.id));
      setDeleteTarget(null);
      setState(
        payload?.cakeDeleteOutcome === "unpublished"
          ? "Cake hidden from customers (it has existing orders)."
          : "Cake removed.",
      );
      router.refresh();
    } catch (reason) {
      setDeleteTarget(null);
      setState("Error");
      setError(reason instanceof Error ? reason.message : "The cake could not be removed.");
    }
  }
  async function save() {
    const changedTypes = types.filter((type) => {
      const previous = savedTypes.find((item) => item.id === type.id);
      const links = (items: typeof assignments) =>
        items
          .filter((link) => link.cakeTypeId === type.id)
          .map((link) => link.optionId)
          .sort();
      return (
        JSON.stringify(previous) !== JSON.stringify(type) ||
        JSON.stringify(links(savedAssignments)) !== JSON.stringify(links(assignments))
      );
    });
    const parsed = cakeTypesSchema.safeParse(changedTypes);
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
        body: JSON.stringify({
          action: "cake-types",
          cakeTypes: parsed.data,
          assignments: assignments.filter((link) => changedTypes.some((type) => type.id === link.cakeTypeId)),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Cake types could not be saved.");
      setSavedTypes(types);
      setSavedAssignments(assignments);
      setState("Saved");
      router.refresh();
    } catch (reason) {
      setState("Error");
      setError(reason instanceof Error ? reason.message : "Save failed. Please retry.");
    }
  }
  return (
    <section className="admin-card cake-types-editor">
      <h2>My cakes</h2>
      <p>
        Add a cake, set its price and preparation time, then publish. Every cake automatically offers all your sizes and
        flavours — you only adjust that if a particular cake is different.
      </p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        {types.length === 0 && (
          <p className="cake-empty-hint">
            No cakes yet. Tap “Quick add cake” below to create your first one — it’s ready to publish as soon as you add
            a price.
          </p>
        )}
        {types.map((type, index) => (
          <details
            className="cake-type-card"
            key={type.id}
            open={expandedCake === type.id}
            onToggle={(event) => {
              if (event.currentTarget.open) setExpandedCake(type.id);
              else if (expandedCake === type.id) setExpandedCake("");
            }}
          >
            <summary>
              <span>{type.name || "New cake"}</span>
              <small>{type.active ? "Published" : "Draft"}</small>
            </summary>
            <article className="form-stack">
              <label>
                Name
                <input value={type.name} onChange={(e) => update(type.id, { name: e.target.value })} />
              </label>
              {collections.length > 0 && (
                <label>
                  Sub-category
                  <select
                    value={type.collectionId ?? ""}
                    onChange={(e) => update(type.id, { collectionId: e.target.value })}
                  >
                    <option value="">No sub-category</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Starting price (CAD)
                <input
                  type="number"
                  min="0"
                  required={type.active}
                  step="0.01"
                  value={type.basePrice == null ? "" : type.basePrice / 100}
                  onChange={(e) =>
                    update(type.id, { basePrice: e.target.value ? Math.round(Number(e.target.value) * 100) : null })
                  }
                />
              </label>
              <details>
                <summary>
                  Tax settings · {type.taxClass === "REQUIRES_REVIEW" ? "Setup required" : "Configured"}
                </summary>
                <label>
                  Tax classification
                  <select
                    value={type.taxClass ?? "REQUIRES_REVIEW"}
                    onChange={(e) => update(type.id, { taxClass: e.target.value as CakeType["taxClass"] })}
                  >
                    <option value="REQUIRES_REVIEW">Setup required</option>
                    <option value="FULL_CAKE">Eligible full cake (zero rated)</option>
                    <option value="WEDDING_CAKE">Eligible edible wedding cake (zero rated)</option>
                    <option value="STANDARD_TAXABLE">Standard taxable</option>
                  </select>
                </label>
              </details>
              <p>
                {type.basePrice == null
                  ? "Add a starting price to publish this cake."
                  : "Starting price + any selected extras = estimated price. Choices needing a quote are confirmed individually."}
              </p>
              <details className="cake-choice-groups">
                <summary>Limit sizes, flavours &amp; extras (optional)</summary>
                <p className="cake-choice-note">
                  Every active choice is included by default. Untick anything this cake shouldn’t offer.
                </p>
                {["size", "flavour", "filling", "design", "occasion"].map((group) => (
                  <fieldset key={group}>
                    <legend>
                      {
                        {
                          size: "Sizes",
                          flavour: "Flavours",
                          filling: "Fillings",
                          design: "Designs",
                          occasion: "Occasions",
                        }[group]
                      }
                    </legend>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setAssignments((current) => [
                          ...current.filter(
                            (link) =>
                              link.cakeTypeId !== type.id ||
                              !options.some((option) => option.id === link.optionId && option.type === group),
                          ),
                          ...options
                            .filter((option) => option.type === group && option.active)
                            .map((option) => ({ cakeTypeId: type.id, optionId: option.id })),
                        ]);
                        setState("Unsaved changes");
                      }}
                    >
                      Use all available {group === "flavour" ? "flavours" : "choices"}
                    </button>
                    {options
                      .filter((option) => option.type === group)
                      .map((option) => (
                        <label className="check-row" key={option.id}>
                          <input
                            type="checkbox"
                            checked={assignments.some(
                              (link) => link.cakeTypeId === type.id && link.optionId === option.id,
                            )}
                            onChange={(event) => {
                              setAssignments((current) =>
                                event.target.checked
                                  ? [...current, { cakeTypeId: type.id, optionId: option.id }]
                                  : current.filter(
                                      (link) => link.cakeTypeId !== type.id || link.optionId !== option.id,
                                    ),
                              );
                              setState("Unsaved changes");
                            }}
                          />
                          {option.name}
                          {option.active ? "" : " (unavailable)"}
                        </label>
                      ))}
                  </fieldset>
                ))}
              </details>
              <label>
                Preparation time
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
                Time unit
                <select
                  value={type.leadTimeUnit}
                  onChange={(e) => update(type.id, { leadTimeUnit: e.target.value as CakeType["leadTimeUnit"] })}
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </label>
              {type.image && (
                <Image
                  src={type.image}
                  alt={`${type.name || "Cake"} photo`}
                  width={180}
                  height={120}
                  unoptimized
                  style={{ objectFit: "cover", borderRadius: 8, maxWidth: "100%" }}
                />
              )}
              <div className="field">
                <span>Photo</span>
                {/** biome-ignore lint/a11y/noStaticElementInteractions: drop zone pairs with the keyboard-accessible file input inside it */}
                <div
                  className={`cake-photo-drop${dragId === type.id ? " is-dragging" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragId(type.id);
                  }}
                  onDragLeave={() => setDragId((current) => (current === type.id ? "" : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragId("");
                    void uploadPhoto(type.id, event.dataTransfer.files?.[0]);
                  }}
                >
                  <input
                    id={`cake-photo-${type.id}`}
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={(event) => {
                      void uploadPhoto(type.id, event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <label htmlFor={`cake-photo-${type.id}`}>
                    <b>Drag a photo here, or tap to upload</b>
                    <small>
                      {uploading
                        ? "Uploading photo…"
                        : type.image
                          ? "Photo added — save your cake to apply it."
                          : "JPEG, PNG or WebP, up to 5 MB."}
                    </small>
                  </label>
                </div>
                <button type="button" className="cake-photo-library" onClick={() => setPickingPhotoFor(type.id)}>
                  Choose from image library
                </button>
              </div>
              <details>
                <summary>Advanced settings</summary>{" "}
                <label>
                  Image URL
                  <input value={type.image} onChange={(e) => update(type.id, { image: e.target.value })} />
                </label>
                <label>
                  URL slug
                  <input value={type.slug} onChange={(e) => update(type.id, { slug: e.target.value })} />
                </label>
                <label>
                  Description
                  <textarea
                    value={type.description}
                    onChange={(e) => update(type.id, { description: e.target.value })}
                  />
                </label>
                <label>
                  Customer notice
                  <textarea
                    value={type.customerNotice}
                    onChange={(e) => update(type.id, { customerNotice: e.target.value })}
                  />
                </label>
              </details>
              <label>
                <input
                  type="checkbox"
                  checked={type.active}
                  onChange={(e) => update(type.id, { active: e.target.checked })}
                />{" "}
                Published (available to customers)
              </label>
              <div className="cake-card-actions">
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                  Move up
                </button>
                <button type="button" disabled={index === types.length - 1} onClick={() => move(index, 1)}>
                  Move down
                </button>
                <button type="button" className="text-button danger-text" onClick={() => requestDelete(type)}>
                  Delete cake
                </button>
              </div>
            </article>
          </details>
        ))}
        <div className="cake-editor-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              const id = crypto.randomUUID();
              setExpandedCake(id);
              setTypes((items) => [
                ...items,
                {
                  id,
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
              // Offer every active choice by default so a new cake is sellable without the
              // owner having to open the choices section and tick anything.
              setAssignments((current) => [
                ...current,
                ...options.filter((option) => option.active).map((option) => ({ cakeTypeId: id, optionId: option.id })),
              ]);
              setState("Unsaved changes");
            }}
          >
            Quick add cake
          </button>
          <button type="button" className="button button-primary" onClick={save}>
            Save cake types
          </button>
        </div>
      </fieldset>
      <p role="status">{state}</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <MediaPicker
        open={Boolean(pickingPhotoFor)}
        onClose={() => setPickingPhotoFor("")}
        onChoose={(item) => {
          update(pickingPhotoFor, { image: item.url });
          setPickingPhotoFor("");
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        tone="danger"
        busy={state === "Saving…"}
        title="Delete this cake?"
        body={
          deleteTarget
            ? `“${deleteTarget.name || "This cake"}” will be removed. If it has existing customer orders it will be hidden from customers instead, so their history stays intact.`
            : ""
        }
        confirmLabel="Delete cake"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
