import type { Viewport } from "next";
import { ThreadsBackground } from "@/components/login/threads-background";
import { LoginCard } from "./login-card";

// Phones: the sheet reaches the screen edges (safe-area insets are padded
// in), and the on-screen keyboard resizes the page so the sheet stays above
// it.
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason, next } = await searchParams;

  return (
    // Below sm: wordmark over the threads, form in a sheet docked to the
    // bottom. From sm: a centred card.
    <div className="dark relative isolate flex min-h-dvh flex-1 flex-col bg-[#0a0a0a] text-foreground sm:items-center sm:justify-center sm:px-4 sm:py-12">
      <ThreadsBackground />
      <p className="relative z-10 mb-auto px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-sm font-semibold tracking-tight text-white/80 sm:hidden">
        COMPEL
      </p>
      <LoginCard
        expired={reason === "expired"}
        next={typeof next === "string" ? next : undefined}
      />
    </div>
  );
}
