export const VIEWPORT_BLOCKOUT_DROP_MIME = "application/x-blud-viewport-blockout" as const;

export type ViewportBlockoutDropKind = "platform" | "closed-room" | "open-room" | "stairs";

export function writeViewportBlockoutDragData(dataTransfer: DataTransfer, kind: ViewportBlockoutDropKind): void {
  dataTransfer.setData(VIEWPORT_BLOCKOUT_DROP_MIME, kind);
  dataTransfer.effectAllowed = "copy";
}

export function parseViewportBlockoutDrop(dataTransfer: DataTransfer): ViewportBlockoutDropKind | null {
  const raw = dataTransfer.getData(VIEWPORT_BLOCKOUT_DROP_MIME);
  if (raw === "platform" || raw === "closed-room" || raw === "open-room" || raw === "stairs") {
    return raw;
  }
  return null;
}

export function isViewportBlockoutDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(VIEWPORT_BLOCKOUT_DROP_MIME);
}
