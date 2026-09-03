import { useEffect, useState } from "react";
import type { WebMcpStatus } from "@/lib/webmcp/useWebMcp";

/**
 * Shows that a browser agent is holding Morphus's tools, and what it last did.
 *
 * An agent editing through WebMCP is otherwise invisible: geometry appears and
 * nobody in the room knows whether the person or the model asked for it. The
 * tools run in the page rather than on a server, so the only record of a call
 * is the one the page chooses to show -- naming the last one keeps the human
 * the person who understands the document.
 */
export function WebMcpIndicator({ status }: { status?: WebMcpStatus }) {
  const [latest] = status?.activity ?? [];
  const [flash, setFlash] = useState(false);

  // A tool call can finish between two frames, and a scene edit is not always
  // obvious on screen. The flash gives it a duration a person can notice.
  useEffect(() => {
    if (!latest) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1200);
    return () => window.clearTimeout(timer);
  }, [latest]);

  // Nothing to say in a browser without the API, which is every browser
  // without the flag or the origin trial. A permanent "unavailable" chip would
  // be noise for almost everyone.
  if (!status?.available) return null;

  const label = status.error
    ? "error"
    : latest
      ? latest.name.replace(/_/g, " ")
      : `${status.registered} tools`;

  return (
    <div
      className="editor-toolbar-segment flex items-center gap-1.5 rounded-[14px] px-2.5 py-1.5"
      title={
        status.error ??
        `${status.registered} Morphus tools are registered with this browser's agent over WebMCP.` +
          (latest ? ` Last call: ${latest.name}.` : "")
      }
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full transition-opacity duration-300 ${
          status.error
            ? "bg-red-400/80"
            : latest?.ok === false
              ? "bg-amber-400/80"
              : "bg-emerald-400/80"
        } ${flash ? "opacity-100" : "opacity-60"}`}
      />
      <span className="hidden text-[9px] font-semibold tracking-[0.16em] text-white/38 uppercase xl:block">
        Agent
      </span>
      <span className="editor-toolbar-readout max-w-[10rem] truncate rounded-[10px] px-2 py-1 text-[9px] font-semibold tracking-[0.14em] uppercase">
        {label}
      </span>
    </div>
  );
}
