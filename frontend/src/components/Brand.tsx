import { Sparkles } from "lucide-react";

/** Lyftr AI logo: violet gradient tile with a sparkle. */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] bg-brand-gradient text-white ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkles size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}
