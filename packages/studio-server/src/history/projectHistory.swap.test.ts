// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { START, type HistoryWho } from "./historyLog";
import { HistoryClosedError, openProjectHistory } from "./projectHistory";

// Lets a test swap the folder at an exact point inside the history's own copies.
const hooks = vi.hoisted(() => ({
  afterWrite: null as null | (() => void),
  beforePut: null as null | (() => void),
}));
vi.mock("./blobStore", async (importOriginal) => {
  const original = await importOriginal<typeof import("./blobStore")>();
  return {
    ...original,
    openBlobStore: async (dir: string) => {
      const store = await original.openBlobStore(dir);
      return {
        ...store,
        put: async (path: string) => {
          hooks.beforePut?.();
          return store.put(path);
        },
        writeTo: async (hash: string, path: string) => {
          await store.writeTo(hash, path);
          hooks.afterWrite?.();
        },
      };
    },
  };
});

const you: HistoryWho = { kind: "person", name: "You" };
const cleanup: Array<() => unknown> = [];
const files = ["a.html", "b.html", "c.html"];

afterEach(async () => {
  hooks.afterWrite = null;
  hooks.beforePut = null;
  for (const step of cleanup.splice(0).reverse()) await step();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function swappable() {
  const root = tempDir("hf-history-swap-");
  const projectDir = join(root, "project");
  const moved = join(root, "moved");
  mkdirSync(projectDir);
  for (const path of files) writeFileSync(join(projectDir, path), "v1");
  const historyRoot = tempDir("hf-history-swap-root-");
  const history = await openProjectHistory({ projectDir, historyRoot });
  cleanup.push(() => history.close());
  const swap = () => {
    renameSync(projectDir, moved);
    mkdirSync(projectDir);
    for (const path of files) writeFileSync(join(projectDir, path), "new project");
  };
  const texts = (dir: string) => files.map((path) => readFileSync(join(dir, path), "utf-8"));
  return { history, projectDir, historyRoot, moved, swap, texts };
}

describe("a project folder swapped while the history is at work", () => {
  it("stops a restore at the next file, so none of the old project's bytes land in the new one", async () => {
    const { history, projectDir, moved, swap, texts } = await swappable();
    const window = await history.beginWindow(you, "Edit");
    for (const path of files) writeFileSync(join(projectDir, path), "edited");
    await window.close();
    hooks.afterWrite = () => {
      hooks.afterWrite = null;
      swap();
    };

    await expect(history.restore(START, you)).rejects.toThrow(HistoryClosedError);
    expect(texts(projectDir)).toEqual(["new project", "new project", "new project"]);
    expect(texts(moved).filter((text) => text === "edited")).toHaveLength(2);
  });

  it("stops a sweep at the next file, so the old history never files the new project's bytes", async () => {
    const { history, projectDir, historyRoot, moved, swap } = await swappable();
    for (const path of files) writeFileSync(join(projectDir, path), "edited");
    let puts = 0;
    hooks.beforePut = () => {
      if (++puts === 2) swap();
    };
    await history.flush();
    await history.close();

    const again = await openProjectHistory({ projectDir: moved, historyRoot });
    cleanup.push(() => again.close());
    const filed: string[] = [];
    for (const entry of again.list())
      for (const file of entry.files)
        if (file.after) filed.push(String(await again.readBlob(file.after)));
    expect(filed).toContain("edited");
    expect(filed).not.toContain("new project");
  });
});
