// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { patchRootCompositionDuration, readRootCompositionDuration } from "./rootDuration";
import { extendRootDurationInSource } from "./timelineAssetDrop";

describe("extendRootDurationInSource", () => {
  const clip = (end: number) => `<i data-start="0" data-duration="${end}"></i>`;
  /** Insert a clip ending at `newEnd` into a root that already holds `content`. */
  const insert = (root: string, newEnd: number, content = "") =>
    extendRootDurationInSource(
      `${root}${content}</div>`,
      `${root}${content}${clip(newEnd)}</div>`,
      newEnd,
    );

  it("extends a derived length and its marker to a new end past it", () => {
    expect(insert(`<div data-composition-id="main" data-duration="4">`, 5.25, clip(4))).toBe(
      `<div data-composition-id="main" data-duration="5.25" data-hf-derived-duration="5.25">${clip(4)}${clip(5.25)}</div>`,
    );
  });

  it("grows a hand-set length to the new end and keeps it hand-set", () => {
    expect(insert(`<div data-composition-id="main" data-duration="4">`, 7)).toBe(
      `<div data-composition-id="main" data-duration="7" data-hf-derived-duration="4">${clip(7)}</div>`,
    );
  });

  it("does nothing when the new end is smaller than or equal to the root duration", () => {
    const root = `<div data-composition-id="main" data-duration="6">`;
    expect(insert(root, 5, clip(6))).toBe(`${root}${clip(6)}${clip(5)}</div>`);
    expect(insert(root, 6, clip(6))).toBe(`${root}${clip(6)}${clip(6)}</div>`);
  });

  it("leaves non-root data-duration attributes untouched by the extension", () => {
    const patched = extendRootDurationInSource(
      `<div data-duration="3"></div><div data-composition-id="main" data-duration="4"></div>`,
      `<div data-duration="3"></div><div data-composition-id="main" data-duration="4">${clip(7)}</div>`,
      7,
    );

    expect(patched).toContain(`<div data-duration="3"></div>`);
    expect(patched).toContain(
      `<div data-composition-id="main" data-duration="7" data-hf-derived-duration="4">`,
    );
  });

  // Reviewer round-2 finding #3: the old regex was attribute-ORDER-dependent and
  // double-quotes-only, so these hand-authored variants silently no-op'd.
  it("extends when data-duration is declared BEFORE data-composition-id", () => {
    expect(insert(`<div data-duration="4" data-composition-id="main">`, 9)).toBe(
      `<div data-duration="9" data-hf-derived-duration="4" data-composition-id="main">${clip(9)}</div>`,
    );
  });

  it("extends when attributes use single quotes", () => {
    expect(insert(`<div data-composition-id='main' data-duration='4'>`, 9)).toBe(
      `<div data-composition-id='main' data-duration='9' data-hf-derived-duration='4'>${clip(9)}</div>`,
    );
  });

  it("extends with swapped order AND single quotes AND extra whitespace", () => {
    expect(insert(`<div  data-duration = '4'  data-composition-id = 'main' >`, 9)).toBe(
      `<div  data-duration = '9' data-hf-derived-duration='4'  data-composition-id = 'main' >${clip(9)}</div>`,
    );
  });
});

describe("readRootCompositionDuration", () => {
  it("reads the root duration regardless of attribute order or quote style", () => {
    expect(
      readRootCompositionDuration(`<div data-composition-id="main" data-duration="4"></div>`),
    ).toBe(4);
    expect(
      readRootCompositionDuration(`<div data-duration="4" data-composition-id="main"></div>`),
    ).toBe(4);
    expect(
      readRootCompositionDuration(`<div data-composition-id='main' data-duration='4.5'></div>`),
    ).toBe(4.5);
  });

  it("reads the FIRST composition when several are present", () => {
    const source = [
      `<div data-composition-id="root" data-duration="10"></div>`,
      `<div data-composition-id="nested" data-duration="2"></div>`,
    ].join("\n");
    expect(readRootCompositionDuration(source)).toBe(10);
  });

  it("returns null when there is no composition root", () => {
    expect(readRootCompositionDuration(`<div data-duration="4"></div>`)).toBeNull();
  });

  it("returns null when the root has no data-duration attribute", () => {
    expect(readRootCompositionDuration(`<div data-composition-id="main"></div>`)).toBeNull();
  });
});

describe("patchRootCompositionDuration", () => {
  it("rewrites only the root's data-duration value, preserving surrounding bytes", () => {
    const source = [
      `<!doctype html>`,
      `<div data-composition-id="main" data-duration="4" data-width="640">`,
      `  <img src="a.png" data-duration="3" />`,
      `</div>`,
    ].join("\n");
    const patched = patchRootCompositionDuration(source, "8");
    expect(patched).toBe(
      [
        `<!doctype html>`,
        `<div data-composition-id="main" data-duration="8" data-width="640">`,
        `  <img src="a.png" data-duration="3" />`,
        `</div>`,
      ].join("\n"),
    );
  });

  it("keeps single-quote style when rewriting", () => {
    expect(
      patchRootCompositionDuration(`<div data-composition-id='main' data-duration='4'></div>`, "8"),
    ).toBe(`<div data-composition-id='main' data-duration='8'></div>`);
  });

  it("is a no-op when the root has no data-duration attribute", () => {
    const source = `<div data-composition-id="main"></div>`;
    expect(patchRootCompositionDuration(source, "8")).toBe(source);
  });
});
