import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { replaceFileAtomically } from "../helpers/atomicFile.js";

export const ID_PATH = join(".hyperframes", "history-id");
/** The only shape minted here; the id is project content and becomes a path, so nothing else is trusted. */
const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readId(projectDir: string): string | null {
  try {
    const id = readFileSync(join(projectDir, ID_PATH), "utf-8").trim();
    return ID_SHAPE.test(id) ? id : null;
  } catch {
    return null;
  }
}

function recordedIno(historyDir: string): number | undefined {
  try {
    return JSON.parse(readFileSync(join(historyDir, "project.json"), "utf-8")).ino;
  } catch {
    return undefined;
  }
}

/**
 * The project's history id, kept in the project so a rename or move keeps its history. Where history exists under it,
 * only the recorded folder (same inode) keeps it; a copy, a restore or a record that cannot tell gets its own.
 */
export function projectHistoryId(projectDir: string, historyRoot: string): string {
  const dir = resolve(projectDir);
  const { ino } = statSync(dir);
  let id = readId(dir);
  if (!id || (existsSync(join(historyRoot, id)) && recordedIno(join(historyRoot, id)) !== ino)) {
    id = randomUUID();
    mkdirSync(join(dir, ".hyperframes"), { recursive: true });
    writeFileSync(join(dir, ID_PATH), `${id}\n`);
  }
  recordProject(join(historyRoot, id), dir, ino);
  return id;
}

export function recordProject(historyDir: string, dir: string, ino: number): void {
  mkdirSync(historyDir, { recursive: true });
  replaceFileAtomically(join(historyDir, "project.json"), JSON.stringify({ dir, ino }), 0o644);
}
