"use client";
import { useCustomerText } from "@/components/customer-text-provider";

export function PrintDocumentButton({ label }: { label?: string }) {
  const t = useCustomerText("print document button");

  return (
    <button
      type="button"
      className="button button-primary document-print-button no-print"
      onClick={() => window.print()}
    >
      {label ?? t("Print or save PDF")}
    </button>
  );
}
