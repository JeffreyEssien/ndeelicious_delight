import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  compact?: boolean;
};

export function BrandLogo({ className = "", compact = false }: BrandLogoProps) {
  return (
    <span className={`brand-logo${compact ? " brand-logo-compact" : ""} ${className}`.trim()}>
      <Image
        src="/WhatsApp Image 2026-09-15 at 22.16.43.jpeg"
        alt="Ndeeelicious Delight"
        fill
        sizes={compact ? "150px" : "190px"}
      />
    </span>
  );
}
