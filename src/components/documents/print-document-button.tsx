"use client";

export function PrintDocumentButton({ label = "Print or save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      className="button button-primary document-print-button no-print"
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
