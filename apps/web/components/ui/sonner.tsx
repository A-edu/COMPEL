"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, OctagonXIcon } from "lucide-react"

// Inner screens are always light (AGENTS.md -> Design system), so the theme is
// fixed rather than read from next-themes. Toasts are for success and error
// only (§7) and are styled like the inner-screen cards.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-destructive" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "rgb(0 0 0 / 0.06)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast text-sm! shadow-[0_1px_2px_0_rgb(0_0_0/0.04),0_4px_16px_-4px_rgb(0_0_0/0.08)]!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
