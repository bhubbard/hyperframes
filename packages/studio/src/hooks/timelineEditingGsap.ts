import { formatTimelineAttributeNumber } from "../player/components/timelineEditing";
import type { IframeWindow } from "../player/lib/playbackTypes";
import { furthestClipEndFromDocument } from "../player/lib/timelineElementHelpers";
import { DERIVED_DURATION_ATTR, readRootLength, type RootLength } from "../utils/rootDuration";
import { resolveRootLength, type ContentEnd } from "../utils/timelineAssetDrop";

export function patchDocumentRootDuration(
  doc: Document | null | undefined,
  contentEnd: number,
  marker: number | null = null,
): boolean {
  if (!doc || !Number.isFinite(contentEnd) || contentEnd <= 0) return false;
  const root = doc.querySelector("[data-composition-id]");
  if (!root) return false;
  root.setAttribute("data-duration", formatTimelineAttributeNumber(contentEnd));
  if (marker == null) root.removeAttribute(DERIVED_DURATION_ATTR);
  else root.setAttribute(DERIVED_DURATION_ATTR, formatTimelineAttributeNumber(marker));
  return true;
}

export function readLiveAnimationEnd(iframe: HTMLIFrameElement | null): number {
  try {
    const win = iframe?.contentWindow as IframeWindow | null | undefined;
    const end = win?.__hf?.animationEnd?.();
    return typeof end === "number" && Number.isFinite(end) && end > 0 ? end : 0;
  } catch {
    return 0;
  }
}

export function isPreviewedFile(path: string, activeCompPath: string | null): boolean {
  return path === (activeCompPath || "index.html");
}

export function animationEndFor(
  iframe: HTMLIFrameElement | null,
  path: string,
  activeCompPath: string | null,
): number {
  return isPreviewedFile(path, activeCompPath) ? readLiveAnimationEnd(iframe) : 0;
}

export type LengthAfterEdit = (after?: ContentEnd) => RootLength;

export function captureLiveLength(iframe: HTMLIFrameElement | null): LengthAfterEdit {
  const root = readRootLength(iframe?.contentDocument);
  const before = liveContentEnd(iframe);
  return (after = liveContentEnd(iframe)) => resolveRootLength(root, before, after);
}

function liveContentEnd(iframe: HTMLIFrameElement | null): ContentEnd {
  return {
    clips: furthestClipEndFromDocument(iframe?.contentDocument),
    animation: readLiveAnimationEnd(iframe),
  };
}
