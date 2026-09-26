import { usePlayerStore } from "../player/store/playerStore";
import { furthestClipEndFromSource } from "../player/lib/timelineElementHelpers";
import { readRootLength, type RootLength } from "../utils/rootDuration";
import { writeRootLength } from "../utils/timelineAssetDrop";
import { persistSdkSerialize } from "../utils/sdkEditTransaction";
import { readProjectFileContent, type RecordEditInput } from "../utils/studioFileHistory";
import {
  isPreviewedFile,
  patchDocumentRootDuration,
  readLiveAnimationEnd,
  type LengthAfterEdit,
} from "./timelineEditingGsap";

/** Best-effort live-iframe wrapper for patchDocumentRootDuration (see timelineEditingGsap). */
function patchIframeRootDuration(iframe: HTMLIFrameElement | null, root: RootLength): void {
  try {
    patchDocumentRootDuration(iframe?.contentDocument ?? null, root.length, root.marker);
  } catch {
    // Cross-origin or mid-navigation — file save is enqueued; iframe patch is best-effort.
  }
}

/** Keep the duration readout and live root aligned with optimistically patched clips. */
export function syncPreviewContentDuration(iframe: HTMLIFrameElement | null, next: RootLength) {
  if (!(next.length > 0)) return;
  usePlayerStore.getState().setDuration(next.length);
  if (next.marker != null) patchIframeRootDuration(iframe, next);
}

/** Restore both store and live-root duration when a timing persist fails. */
export function captureDurationRollback(iframe: HTMLIFrameElement | null): () => void {
  const previousDuration = usePlayerStore.getState().duration;
  const previousMarker = readRootLength(iframe?.contentDocument).marker;
  return () => {
    if (usePlayerStore.getState().duration === previousDuration) return;
    usePlayerStore.getState().setDuration(previousDuration);
    patchIframeRootDuration(iframe, { length: previousDuration, marker: previousMarker });
  };
}

/** What a timing edit captured at its start to re-decide the length once the preview converged. */
export interface LengthSync {
  lengthAfterEdit: LengthAfterEdit;
  activeCompPath: string | null;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
}

/**
 * Re-decide the previewed file's length from the converged animation end and write it,
 * folded into the gesture's undo step. A failure only logs: the edit itself already landed.
 */
export async function syncConvergedLength(input: {
  iframe: HTMLIFrameElement | null;
  reloadPreview: () => void;
  projectId: string | null;
  targetPath: string;
  label: string;
  coalesceKey?: string;
  coalesceMs: number;
  recordEdit: (edit: RecordEditInput) => Promise<void>;
  lengthSync?: LengthSync;
}): Promise<void> {
  const { iframe, projectId, targetPath, lengthSync } = input;
  if (!lengthSync || !projectId || !isPreviewedFile(targetPath, lengthSync.activeCompPath)) return;
  const decided: { next?: RootLength } = {};
  try {
    await persistSdkSerialize(
      (onDisk) => {
        decided.next = lengthSync.lengthAfterEdit({
          clips: furthestClipEndFromSource(onDisk),
          animation: readLiveAnimationEnd(iframe),
        });
        return writeRootLength(onDisk, decided.next);
      },
      targetPath,
      "",
      {
        editHistory: { recordEdit: input.recordEdit },
        writeProjectFile: lengthSync.writeProjectFile,
        reloadPreview: input.reloadPreview,
        readProjectFile: (path) => readProjectFileContent(projectId, path),
      },
      {
        label: input.label,
        coalesceKey: input.coalesceKey,
        coalesceMs: input.coalesceMs,
        skipRefresh: true,
      },
    );
  } catch (error) {
    console.error("[Timeline] Failed to sync the length after the edit", error);
    return;
  }
  if (decided.next) syncPreviewContentDuration(iframe, decided.next);
}
