"use client";
import { Button } from "@/components/ui/primitives";
import { ModalOverlay } from "@/components/ui/modal-overlay";

// A single, calm confirmation for anything destructive — replaces the browser's
// native confirm() so the copy is reassuring and the styling stays on-brand.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Keep it",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <ModalOverlay open onClose={onCancel} className="admin-confirm" scrimClassName="admin-scrim" ariaLabel={title}>
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="admin-confirm-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </Button>
      </div>
    </ModalOverlay>
  );
}
