import type { Viewport } from "next";
import { ThreadsBackground } from "@/components/login/threads-background";
import { LoginCard } from "./login-card";

// Phones: the bottom gap clears the home indicator (safe-area inset), and
// the on-screen keyboard resizes the page so the card stays above it.
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason, next } = await searchParams;

  return (
    // Below sm: card docked near the bottom, with gaps that shrink on narrow
    // screens so six 44 px code slots still fit. From sm: a centred card.
    <div data-login-page className="dark relative isolate flex min-h-dvh flex-1 flex-col justify-end bg-[#0a0a0a] px-2 pt-12 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-foreground min-[360px]:px-3 min-[360px]:pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[400px]:px-4 min-[400px]:pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:py-12">
      <ThreadsBackground />
      <LoginCard
        expired={reason === "expired"}
        next={typeof next === "string" ? next : undefined}
      />
    </div>
  );
}
