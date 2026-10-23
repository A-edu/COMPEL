"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

// Loaded only in the browser, after the card has rendered, so the form never
// waits on WebGL. Until then, or when WebGL2 is unavailable (Threads then
// renders nothing), the plain page background shows.
const Threads = dynamic(() => import("@/components/Threads"), { ssr: false });

export function ThreadsBackground() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // Tells a missing WebGL2 apart from a bug when the background is blank.
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      console.warn(
        "Threads background: WebGL2 is unavailable in this browser, so the plain background is shown.",
      );
      return;
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <Threads speed={0.3} enableMouseInteraction={false} />
    </div>
  );
}
