"use client";

import dynamic from "next/dynamic";

// Loaded only in the browser, after the card has rendered, so the form never
// waits on WebGL. Until then the plain page background shows.
const Threads = dynamic(() => import("@/components/Threads"), { ssr: false });

export function ThreadsBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0">
      <Threads speed={0.3} enableMouseInteraction={false} />
    </div>
  );
}
