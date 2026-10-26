"use client";

import { useEffect, useRef } from "react";
import Threads from "@/components/Threads";

// Bundled with the page (not a separate chunk) so it is ready the moment the
// page hydrates. The card stays hidden until this layer is marked
// `data-threads-ready` (see globals.css), so both appear together.
export function ThreadsBackground() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Child effects run first, so by now Threads has drawn its first frame,
    // or found WebGL2 unavailable and rendered nothing. Either way the card
    // can show.
    layerRef.current?.setAttribute("data-threads-ready", "");

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
    <div
      ref={layerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-0 data-threads-ready:opacity-100 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out"
    >
      <Threads speed={0.3} enableMouseInteraction={false} />
    </div>
  );
}
