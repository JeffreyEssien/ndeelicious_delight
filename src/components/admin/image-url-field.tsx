"use client";

import { useState } from "react";
import { MediaPicker, MediaThumb } from "@/components/admin/media-library";
import type { MediaItem } from "@/types/media";

// An image link field with a preview and a "Choose from library" button, for any place in the
// admin that stores an image by its link.
export function ImageUrlField({
  label,
  value,
  onChange,
  onChooseItem,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Also told which library image was chosen, for filling a matching description field. */
  onChooseItem?: (item: MediaItem) => void;
  hint?: string;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="field image-url-field">
      <label>
        <span>{label}</span>
        <div className="image-url-row">
          <span className="image-url-thumb" aria-hidden="true">
            {value ? <MediaThumb url={value} alt="" width={160} /> : null}
          </span>
          <input
            value={value}
            placeholder="Paste a link or choose from the library"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </label>
      <div className="image-url-actions">
        <button type="button" onClick={() => setPicking(true)}>
          Choose from library
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
      {hint && <small className="field-hint">{hint}</small>}
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={(item) => {
          onChange(item.url);
          onChooseItem?.(item);
          setPicking(false);
        }}
      />
    </div>
  );
}
