/**
 * The bridge between "something asked for a cast" and the live viewport.
 *
 * Abilities need a scene, a light pool, a particle engine and the rest of the
 * shared services, and those only exist once the viewport has mounted. Anything
 * outside the canvas -- a Copilot tool, a panel button, a hotkey -- therefore
 * cannot cast directly; it queues a request here and the viewport drains it on
 * its next frame.
 *
 * The point of queuing is that a request made *before* the viewport is ready is
 * still honoured. So a request is never refused for the viewport being down, and
 * the queue is not cleared when the viewport goes away -- switching view mode
 * unmounts and remounts the layer, and a cast asked for across that boundary
 * should still play.
 *
 * What the queue does drop is requests that have gone stale. A cast that has sat
 * unplayed for `MAX_WAIT_MS` is answering a question the user has stopped
 * asking, and letting a minute of them fire at once the moment a viewport
 * appears is worse than never playing them.
 */

import type { ElementId } from "@blud/vfx";

export type VfxCastRequest = {
  element: ElementId;
  /** Ground-plane origin of the cast, world metres. */
  origin: { x: number; y: number; z: number };
  /** Flat heading. Normalised by the ability; need not be unit here. */
  direction: { x: number; z: number };
  /** How far the cast reaches, metres. */
  distance: number;
};

type QueuedCast = VfxCastRequest & { requestedAt: number };

export type VfxCastOutcome = {
  element: ElementId;
  accepted: boolean;
  /** True when the cast is waiting for a viewport rather than playing now. */
  deferred: boolean;
  reason?: string;
};

/**
 * How long a queued cast stays worth playing.
 *
 * Long enough to cover a viewport remount or a slow first frame, short enough
 * that a cast queued and forgotten does not surprise the user later.
 */
const MAX_WAIT_MS = 10_000;

/**
 * Cap on outstanding casts.
 *
 * A runaway loop is worse than a dropped cast: each spawns geometry, particles
 * and a dynamic light that the manager only retires on its own schedule.
 */
const MAX_QUEUED = 16;

const queue: QueuedCast[] = [];
let viewportReady = false;

/** Requests a cast. Safe before the viewport exists -- it will play once it does. */
export function requestVfxCast(request: VfxCastRequest): VfxCastOutcome {
  dropStale();

  if (queue.length >= MAX_QUEUED) {
    return {
      accepted: false,
      deferred: false,
      element: request.element,
      reason: "Too many casts are already waiting; let the current ones finish."
    };
  }

  queue.push({ ...request, requestedAt: Date.now() });
  return { accepted: true, deferred: !viewportReady, element: request.element };
}

/** Drained by the viewport once per frame. */
export function drainVfxCasts(): VfxCastRequest[] {
  dropStale();
  if (queue.length === 0) return [];
  return queue.splice(0, queue.length).map(({ requestedAt: _requestedAt, ...request }) => request);
}

function dropStale(): void {
  if (queue.length === 0) return;
  const cutoff = Date.now() - MAX_WAIT_MS;
  let keep = 0;
  for (const entry of queue) {
    if (entry.requestedAt >= cutoff) queue[keep++] = entry;
  }
  queue.length = keep;
}

/**
 * Reports whether a viewport is mounted and stepping casts.
 *
 * Deliberately does not touch the queue: the layer unmounts and remounts
 * whenever the view mode changes, and a cast asked for in between is exactly
 * the one queuing exists to keep.
 */
export function setVfxViewportReady(ready: boolean): void {
  viewportReady = ready;
}

export function isVfxViewportReady(): boolean {
  return viewportReady;
}

/** Outstanding casts, for status reporting. */
export function pendingVfxCastCount(): number {
  dropStale();
  return queue.length;
}
