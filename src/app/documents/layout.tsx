import type { Metadata } from "next";
import "../documents.css";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default function DocumentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
