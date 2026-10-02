"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let pageLockDepth = 0;
let inertSnapshot: Array<{ element: HTMLElement; inert: boolean }> = [];
const overlayStack: symbol[] = [];

function lockBackground() {
  if (pageLockDepth === 0) {
    inertSnapshot = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element.dataset.overlayRoot !== "true",
      )
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of inertSnapshot) element.inert = true;
  }
  pageLockDepth += 1;
  document.body.dataset.overlayOpen = "true";
}

function unlockBackground() {
  pageLockDepth = Math.max(0, pageLockDepth - 1);
  if (pageLockDepth > 0) return false;
  for (const { element, inert } of inertSnapshot) element.inert = inert;
  inertSnapshot = [];
  delete document.body.dataset.overlayOpen;
  return true;
}

export function ModalOverlay({
  open,
  onClose,
  children,
  className,
  scrimClassName = "",
  labelledBy,
  ariaLabel,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className: string;
  scrimClassName?: string;
  labelledBy?: string;
  ariaLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const overlayId = useRef(Symbol("modal-overlay"));

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open || !mounted) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = overlayId.current;
    overlayStack.push(id);
    lockBackground();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || overlayStack.at(-1) !== id) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleEscape, true);
    const frame = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ?? panel.current?.querySelector<HTMLElement>(focusableSelector) ?? panel.current;
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleEscape, true);
      const stackIndex = overlayStack.lastIndexOf(id);
      if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
      if (unlockBackground()) opener.current?.focus();
    };
  }, [initialFocusRef, mounted, open]);

  if (!mounted || !open) return null;
  return createPortal(
    <div data-overlay-root="true">
      <button type="button" className={`scrim ${scrimClassName}`.trim()} onClick={onClose} aria-label="Close" />
      <section
        ref={panel}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab" || !panel.current) return;
          const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
            (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
          );
          if (!focusable.length) {
            event.preventDefault();
            panel.current.focus();
            return;
          }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
