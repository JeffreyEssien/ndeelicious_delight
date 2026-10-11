"use client";
import { useEffect } from "react";
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const sectionChange = (event: Event) => {
      if (!window.confirm("You have unsaved changes. Leave without saving?")) event.preventDefault();
    };
    document.addEventListener("admin-section-change", sectionChange);
    const navigate = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? (event.target.closest("a[href]") as HTMLAnchorElement | null) : null;
      if (
        !link ||
        link.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        link.origin !== window.location.origin ||
        link.href === window.location.href
      )
        return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      document.removeEventListener("admin-section-change", sectionChange);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
}

export function confirmSectionChange() {
  return document.dispatchEvent(new Event("admin-section-change", { cancelable: true }));
}
