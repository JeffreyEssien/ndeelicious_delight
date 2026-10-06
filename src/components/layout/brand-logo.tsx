"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
  priority?: boolean;
};

export function BrandLogo({ className = "", compact = false, priority = false }: BrandLogoProps) {
  const t = useCustomerText("brand logo");

  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""} ${className}`.trim()}>
      <Image
        src="/brand-logo.jpg"
        alt={t("Ndeeelicious Delight")}
        fill
        sizes={compact ? "150px" : "190px"}
        priority={priority}
      />
    </span>
  );
}
