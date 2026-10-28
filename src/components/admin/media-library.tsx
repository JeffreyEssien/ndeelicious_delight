"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { Button, Input, Textarea } from "@/components/ui/primitives";
import { prepareImageForUpload } from "@/lib/images/prepare-upload";
import type { MediaItem, MediaSource } from "@/types/media";

const sourceNames: Record<MediaSource, string> = {
  library: "Uploaded",
  product: "Products",
  cake: "Cakes",
  content: "Website",
  "built-in": "Built-in",
};
type Filter = "all" | "unused" | MediaSource;
type Sort = "newest" | "name" | "most-used";

const OFFLINE = "You appear to be offline. Check your connection and try again.";

async function send(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("Your admin session has ended. Sign in again.");
  if (!response.ok) throw Object.assign(new Error(payload.error ?? "Something went wrong."), { payload });
  return payload;
}

// The full link to an image, for pasting anywhere (built-in images are stored site-relative).
export const absoluteImageUrl = (url: string) => new URL(url, window.location.origin).href;

// Cloudinary resizes on the fly, so grids load small copies instead of full-size originals.
export function thumbnailUrl(url: string, width = 480) {
  return url.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/,
    `$1c_limit,w_${width},q_auto,f_auto/`,
  );
}

export function formatBytes(bytes?: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Upload = { key: string; name: string; progress: number; error?: string };

function postWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void) {
  return new Promise<{ public_id?: string; error?: { message?: string } } | null>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.timeout = 120_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => resolve(request.response);
    request.onerror = () => resolve(null);
    request.ontimeout = () => resolve(null);
    request.send(body);
  });
}

// Converts, uploads straight to Cloudinary, then records the image in the library.
async function uploadOne(file: File, onProgress: (fraction: number) => void): Promise<MediaItem> {
  const ready = await prepareImageForUpload(file);
  const sign = await send("/api/admin/media/sign", { method: "POST" });
  const form = new FormData();
  for (const [key, value] of Object.entries(sign.fields as Record<string, string | number>))
    form.set(key, String(value));
  form.set("file", ready);
  // A dropped connection is retried once before giving up.
  let uploaded = await postWithProgress(sign.uploadUrl, form, onProgress);
  if (!uploaded) uploaded = await postWithProgress(sign.uploadUrl, form, onProgress);
  if (uploaded?.error?.message) throw new Error(uploaded.error.message);
  if (!uploaded?.public_id) throw new Error("The upload did not finish. Check your connection and try again.");
  const payload = await send("/api/admin/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicId: uploaded.public_id,
      title: file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .slice(0, 120),
      altText: "",
    }),
  });
  return payload.item as MediaItem;
}

function useMediaLibrary(enabled = true) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const notify = useToast();

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const payload = await send("/api/admin/media");
      setItems(payload.items);
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);

  const upload = useCallback(
    async (files: File[]) => {
      const queued = files.map((file) => ({ file, key: crypto.randomUUID() }));
      setUploads((current) => [...current, ...queued.map(({ file, key }) => ({ key, name: file.name, progress: 0 }))]);
      const added: MediaItem[] = [];
      // One at a time keeps a phone connection from stalling on several large photos at once.
      for (const { file, key } of queued) {
        const patch = (change: Partial<Upload>) =>
          setUploads((current) => current.map((upload) => (upload.key === key ? { ...upload, ...change } : upload)));
        try {
          const item = await uploadOne(file, (progress) => patch({ progress }));
          added.push(item);
          setItems((current) => [item, ...current]);
          setUploads((current) => current.filter((upload) => upload.key !== key));
        } catch (error) {
          patch({ error: error instanceof Error ? error.message : "Upload failed." });
        }
      }
      if (added.length) notify(added.length === 1 ? "Image added to the library." : `${added.length} images added.`);
      return added;
    },
    [notify],
  );
  const dismissUpload = (key: string) => setUploads((current) => current.filter((upload) => upload.key !== key));
  return { items, setItems, status, reload, upload, uploads, dismissUpload };
}

export function MediaThumb({ url, alt, width = 480 }: { url: string; alt: string; width?: number }) {
  // Remembers which link failed, so typing a new link into a field tries again.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (brokenUrl === url) return <span className="media-thumb-missing">Preview unavailable</span>;
  return (
    // biome-ignore lint/performance/noImgElement: library images can live on any host, which the image optimizer would refuse.
    <img src={thumbnailUrl(url, width)} alt={alt} loading="lazy" decoding="async" onError={() => setBrokenUrl(url)} />
  );
}

function useFilteredItems(items: MediaItem[]) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: items.length, unused: 0 };
    for (const item of items) {
      result[item.source] = (result[item.source] ?? 0) + 1;
      if (!item.usedIn.length) result.unused += 1;
    }
    return result;
  }, [items]);
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = items.filter((item) => {
      if (filter === "unused" ? item.usedIn.length > 0 : filter !== "all" && item.source !== filter) return false;
      const haystack = [item.title, item.altText, item.url, ...item.usedIn.map((usage) => usage.label)]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
    if (sort === "name") return [...matches].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "most-used") return [...matches].sort((a, b) => b.usedIn.length - a.usedIn.length);
    // Newest uploads first; everything without a date keeps its natural order after them.
    return [...matches].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [filter, items, query, sort]);
  return { query, setQuery, filter, setFilter, sort, setSort, counts, visible };
}

function MediaToolbar({
  view,
  onUpload,
  compact = false,
}: {
  view: ReturnType<typeof useFilteredItems>;
  onUpload: (files: File[]) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const filters: Filter[] = ["all", "library", "product", "cake", "content", "built-in", "unused"];
  return (
    <div className={`media-toolbar${compact ? " is-compact" : ""}`}>
      <div className="media-toolbar-row">
        <Input
          className="media-search"
          label="Search images"
          placeholder="Name, description or where it is used"
          value={view.query}
          onChange={(event) => view.setQuery(event.target.value)}
          type="search"
        />
        <label className="field media-sort">
          <span>Sort by</span>
          <select value={view.sort} onChange={(event) => view.setSort(event.target.value as Sort)}>
            <option value="newest">Newest uploads</option>
            <option value="name">Name A–Z</option>
            <option value="most-used">Most used</option>
          </select>
        </label>
        <Button className="media-upload-button" onClick={() => input.current?.click()}>
          Upload images
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) onUpload(files);
          }}
        />
      </div>
      <fieldset className="media-filters" aria-label="Show images from">
        {filters.map((filter) =>
          filter === "all" || filter === "unused" || view.counts[filter] ? (
            <button
              type="button"
              key={filter}
              className={view.filter === filter ? "active" : ""}
              aria-pressed={view.filter === filter}
              onClick={() => view.setFilter(filter)}
            >
              {filter === "all" ? "All" : filter === "unused" ? "Not used" : sourceNames[filter]}
              <span>{view.counts[filter] ?? 0}</span>
            </button>
          ) : null,
        )}
      </fieldset>
    </div>
  );
}

function UploadQueue({ uploads, onDismiss }: { uploads: Upload[]; onDismiss: (key: string) => void }) {
  if (!uploads.length) return null;
  return (
    <ul className="media-uploads" aria-live="polite">
      {uploads.map((upload) => (
        <li key={upload.key} className={upload.error ? "has-error" : ""}>
          <span>{upload.name}</span>
          {upload.error ? (
            <>
              <small>{upload.error}</small>
              <button type="button" onClick={() => onDismiss(upload.key)}>
                Dismiss
              </button>
            </>
          ) : (
            <progress value={upload.progress} max={1} aria-label={`Uploading ${upload.name}`} />
          )}
        </li>
      ))}
    </ul>
  );
}

// Files dragged anywhere over the area are uploaded when dropped.
function useDropZone(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  return {
    dragging,
    handlers: {
      onDragEnter: (event: React.DragEvent) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        depth.current += 1;
        setDragging(true);
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      },
      onDragOver: (event: React.DragEvent) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(event.dataTransfer.files).filter(
          (file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name),
        );
        if (files.length) onFiles(files);
      },
    },
  };
}

function MediaGrid({
  items,
  onOpen,
  onCopy,
  actionLabel,
}: {
  items: MediaItem[];
  onOpen: (item: MediaItem) => void;
  onCopy?: (item: MediaItem) => void;
  actionLabel: (item: MediaItem) => string;
}) {
  return (
    <ul className="media-grid">
      {items.map((item) => (
        <li key={item.id} className="media-card">
          <button
            type="button"
            className="media-card-image"
            onClick={() => onOpen(item)}
            aria-label={actionLabel(item)}
          >
            <MediaThumb url={item.url} alt={item.altText || item.title} />
            <span className={`media-source media-source-${item.source}`}>{sourceNames[item.source]}</span>
          </button>
          <div className="media-card-body">
            <b title={item.title}>{item.title}</b>
            <small>
              {item.usedIn.length
                ? `Used in ${item.usedIn.length} place${item.usedIn.length === 1 ? "" : "s"}`
                : "Not used yet"}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            </small>
          </div>
          {onCopy && (
            <button type="button" className="media-card-copy" onClick={() => onCopy(item)}>
              Copy link
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function useCopyLink() {
  const notify = useToast();
  return useCallback(
    async (item: MediaItem) => {
      try {
        await navigator.clipboard.writeText(absoluteImageUrl(item.url));
        notify("Link copied.");
      } catch {
        notify("Could not copy. Select the link and copy it instead.");
      }
    },
    [notify],
  );
}

function MediaPreview({
  item,
  onClose,
  onStep,
  onSaved,
  onDeleted,
}: {
  item: MediaItem;
  onClose: () => void;
  onStep: (direction: 1 | -1) => void;
  onSaved: (item: MediaItem) => void;
  onDeleted: (item: MediaItem) => void;
}) {
  const notify = useToast();
  const copy = useCopyLink();
  const [title, setTitle] = useState(item.title);
  const [altText, setAltText] = useState(item.altText);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    setTitle(item.title);
    setAltText(item.altText);
    setSize(null);
  }, [item]);
  const editable = item.source === "library";
  const dirty = editable && (title !== item.title || altText !== item.altText);
  const link = absoluteImageUrl(item.url);
  const width = item.width ?? size?.width;
  const height = item.height ?? size?.height;
  // Arrow keys move through the images, except while typing in a field or confirming a delete.
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (confirming || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") onStep(1);
      if (event.key === "ArrowLeft") onStep(-1);
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [confirming, onStep]);

  async function save() {
    setBusy(true);
    try {
      const payload = await send(`/api/admin/media/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, altText }),
      });
      onSaved({ ...payload.item, usedIn: item.usedIn });
      notify("Image details saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "The details could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await send(`/api/admin/media/${item.id}`, { method: "DELETE" });
      notify("Image deleted.");
      setConfirming(false);
      onDeleted(item);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The image could not be deleted.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay open onClose={onClose} className="media-preview" scrimClassName="admin-scrim" ariaLabel={item.title}>
      <div className="media-preview-inner">
        <div className="media-preview-stage">
          {failedUrl === item.url ? (
            <span className="media-thumb-missing">
              This image could not be loaded. Check that its link still works.
            </span>
          ) : (
            // biome-ignore lint/performance/noImgElement: library images can live on any host, which the image optimizer would refuse.
            <img
              src={item.url}
              alt={item.altText || item.title}
              onLoad={(event) =>
                setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
              }
              onError={() => setFailedUrl(item.url)}
            />
          )}
          <button
            type="button"
            className="media-preview-step is-prev"
            onClick={() => onStep(-1)}
            aria-label="Previous image"
          >
            ←
          </button>
          <button
            type="button"
            className="media-preview-step is-next"
            onClick={() => onStep(1)}
            aria-label="Next image"
          >
            →
          </button>
        </div>
        <aside className="media-preview-details">
          <div className="media-preview-head">
            <span className={`media-source media-source-${item.source}`}>{sourceNames[item.source]}</span>
            <button type="button" className="media-preview-close" onClick={onClose} aria-label="Close preview">
              ×
            </button>
          </div>
          {editable ? (
            <>
              <Input label="Name" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
              <Textarea
                label="Description for screen readers"
                value={altText}
                maxLength={300}
                rows={2}
                onChange={(event) => setAltText(event.target.value)}
              />
              {dirty && (
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save details"}
                </Button>
              )}
            </>
          ) : (
            <h2>{item.title}</h2>
          )}
          <label className="field">
            <span>Image link</span>
            <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <div className="media-preview-actions">
            <Button onClick={() => copy(item)}>Copy link</Button>
            <a className="button button-secondary" href={link} target="_blank" rel="noopener">
              Open full size
            </a>
          </div>
          <dl className="media-preview-facts">
            {width && height ? (
              <>
                <dt>Size</dt>
                <dd>
                  {width} × {height} px{item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
                </dd>
              </>
            ) : null}
            {item.format ? (
              <>
                <dt>Format</dt>
                <dd>{item.format.toUpperCase()}</dd>
              </>
            ) : null}
            {item.createdAt ? (
              <>
                <dt>Uploaded</dt>
                <dd>{new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</dd>
              </>
            ) : null}
          </dl>
          <div className="media-preview-usage">
            <h3>Used in</h3>
            {item.usedIn.length ? (
              <ul>
                {item.usedIn.map((usage) => (
                  <li key={usage.label}>{usage.href ? <Link href={usage.href}>{usage.label}</Link> : usage.label}</li>
                ))}
              </ul>
            ) : (
              <p>
                Not used on the website yet. Paste its link into any image field, or pick it from the library there.
              </p>
            )}
          </div>
          {editable && (
            <div className="media-preview-danger">
              <Button
                variant="danger"
                onClick={() => setConfirming(true)}
                disabled={busy || item.usedIn.length > 0}
                title={item.usedIn.length ? "Replace this image where it is used before deleting it." : undefined}
              >
                Delete image
              </Button>
              {item.usedIn.length > 0 && <small>Replace it where it is used before deleting it.</small>}
            </div>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Delete this image?"
        body="It will be removed from the library and from storage. This cannot be undone."
        confirmLabel="Delete image"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </ModalOverlay>
  );
}

// The admin "Image library" page.
export function MediaLibrary() {
  const library = useMediaLibrary();
  const view = useFilteredItems(library.items);
  const copy = useCopyLink();
  const drop = useDropZone((files) => void library.upload(files));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = library.items.find((item) => item.id === openId) ?? null;

  function step(direction: 1 | -1) {
    const index = view.visible.findIndex((item) => item.id === openId);
    if (index < 0 || !view.visible.length) return;
    setOpenId(view.visible[(index + direction + view.visible.length) % view.visible.length].id);
  }

  return (
    <div className={`media-library${drop.dragging ? " is-dragging" : ""}`} {...drop.handlers}>
      <section className="admin-card media-intro">
        <p>
          Every image on your website in one place. Upload new ones, copy a link to use anywhere, or pick them straight
          from image fields across the admin. Drag photos onto this page to upload them.
        </p>
        <MediaToolbar view={view} onUpload={(files) => void library.upload(files)} />
        <UploadQueue uploads={library.uploads} onDismiss={library.dismissUpload} />
      </section>
      {library.status === "loading" && !library.items.length ? (
        <p className="media-empty">Loading images…</p>
      ) : library.status === "failed" ? (
        <div className="media-empty">
          <p>The image library could not be loaded.</p>
          <Button variant="secondary" onClick={() => void library.reload()}>
            Try again
          </Button>
        </div>
      ) : view.visible.length ? (
        <MediaGrid
          items={view.visible}
          onOpen={(item) => setOpenId(item.id)}
          onCopy={copy}
          actionLabel={(item) => `Preview ${item.title}`}
        />
      ) : (
        <p className="media-empty">No images match. Try another search or filter.</p>
      )}
      {drop.dragging && <div className="media-drop-hint">Drop to upload</div>}
      {open && (
        <MediaPreview
          item={open}
          onClose={() => setOpenId(null)}
          onStep={step}
          onSaved={(saved) =>
            library.setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)))
          }
          onDeleted={(deleted) => {
            setOpenId(null);
            library.setItems((current) => current.filter((item) => item.id !== deleted.id));
          }}
        />
      )}
    </div>
  );
}

// A dialog for choosing (or uploading) an image from anywhere in the admin.
export function MediaPicker({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (item: MediaItem) => void;
}) {
  const library = useMediaLibrary(open);
  const view = useFilteredItems(library.items);
  const drop = useDropZone(async (files) => {
    const added = await library.upload(files);
    if (added.length === 1) onChoose(added[0]);
  });
  if (!open) return null;
  return (
    <ModalOverlay
      open
      onClose={onClose}
      className="media-picker"
      scrimClassName="admin-scrim"
      ariaLabel="Choose an image"
    >
      <div className={`media-picker-body${drop.dragging ? " is-dragging" : ""}`} {...drop.handlers}>
        <div className="media-picker-head">
          <h2>Choose an image</h2>
          <button type="button" className="media-preview-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <MediaToolbar
          compact
          view={view}
          onUpload={async (files) => {
            const added = await library.upload(files);
            // A single new upload is almost always the one wanted, so use it straight away.
            if (added.length === 1) onChoose(added[0]);
          }}
        />
        <UploadQueue uploads={library.uploads} onDismiss={library.dismissUpload} />
        {library.status === "loading" ? (
          <p className="media-empty">Loading images…</p>
        ) : library.status === "failed" ? (
          <div className="media-empty">
            <p>The image library could not be loaded.</p>
            <Button variant="secondary" onClick={() => void library.reload()}>
              Try again
            </Button>
          </div>
        ) : view.visible.length ? (
          <MediaGrid items={view.visible} onOpen={onChoose} actionLabel={(item) => `Use ${item.title}`} />
        ) : (
          <p className="media-empty">No images match. Try another search or filter, or upload one.</p>
        )}
        {drop.dragging && <div className="media-drop-hint">Drop to upload</div>}
      </div>
    </ModalOverlay>
  );
}
