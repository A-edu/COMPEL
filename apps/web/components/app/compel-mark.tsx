import { cn } from "@/lib/utils";

// The COMPEL mark. Mirrors app/icon.svg (the favicon), fixed to its light
// colours since inner screens are always light.
export function CompelMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="#0a0a0a" />
      <path
        d="M20.7 10.3A8 8 0 1 0 15 24L25.5 12.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
