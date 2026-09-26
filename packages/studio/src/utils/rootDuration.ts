/**
 * Matches the opening tag of the ROOT composition element — the first tag that
 * carries a `data-composition-id` attribute, regardless of where the attribute
 * sits in the tag or how its value is quoted. `[^>]*` keeps the match inside a
 * single tag, so the first hit is the first composition in document order (the
 * same element `doc.querySelector("[data-composition-id]")` resolves to).
 */
const ROOT_COMPOSITION_OPEN_TAG_RE = /<[^>]*\bdata-composition-id(?=[\s=/>])[^>]*>/i;

/**
 * Matches a `data-duration="..."` attribute inside a single opening tag. Quote
 * style is captured (backreferenced), so both `"` and `'` round-trip, and the
 * `\s*` around `=` tolerates author whitespace.
 */
const DATA_DURATION_ATTR_RE = /(\bdata-duration\s*=\s*)(["'])[^"']*\2/i;

/** Written beside a derived `data-duration`; a length that no longer matches it was set by hand. */
export const DERIVED_DURATION_ATTR = "data-hf-derived-duration";
const DERIVED_DURATION_ATTR_RE = new RegExp(
  `(\\b${DERIVED_DURATION_ATTR}\\s*=\\s*)(["'])[^"']*\\2`,
  "i",
);

/**
 * Read the ROOT composition's raw `data-duration`.
 *
 * Parses the source with DOMParser and locates the root the same way the rest of
 * the timeline code does — the first `[data-composition-id]` element in document
 * order — then reads its `data-duration`. Because it works on the parsed tree,
 * attribute order and quote style are irrelevant, unlike the previous
 * order-dependent, double-quotes-only regex.
 *
 * Returns `null` when there is no root composition or the root has no
 * `data-duration` attribute at all. When the attribute is present but not a
 * number the parsed `NaN` is returned as-is, so callers reproduce the old
 * regex's "attribute matched but value unusable" behavior.
 *
 * Deterministic and render-safe: DOMParser is the only DOM global used.
 */
export function readRootCompositionDuration(source: string): number | null {
  return readDocumentRootDuration(new DOMParser().parseFromString(source, "text/html"));
}

/** The root's length and marker as authored; either may be missing. */
export interface StoredRootLength {
  length: number | null;
  marker: number | null;
}

/** The root's length after an edit; a null `marker` is a hand-set length left as it is. */
export interface RootLength {
  length: number;
  marker: number | null;
}

function readDocumentRootDuration(
  doc: Document | null | undefined,
  attribute = "data-duration",
): number | null {
  const raw = doc?.querySelector("[data-composition-id]")?.getAttribute(attribute);
  return raw == null ? null : Number.parseFloat(raw);
}

export function readRootLength(doc: Document | null | undefined): StoredRootLength {
  return {
    length: readDocumentRootDuration(doc),
    marker: readDocumentRootDuration(doc, DERIVED_DURATION_ATTR),
  };
}

/**
 * Rewrite the ROOT composition's `data-duration` value, preserving the rest of
 * the document byte-for-byte.
 *
 * We deliberately do NOT re-serialize the parsed Document: a DOMParser round-trip
 * injects `<html>/<head>/<body>`, forces double quotes, self-closes void
 * elements, and drops the original indentation — it reformats unrelated markup.
 * Instead we locate the root opening tag and rewrite only its `data-duration`
 * value in place, keeping the author's quote style. The targeted splice is
 * attribute-order-, quote-, and whitespace-agnostic.
 *
 * No-op (returns `source` unchanged) when there is no root composition tag or the
 * root tag has no `data-duration` attribute to replace.
 */
export function patchRootCompositionDuration(source: string, newValue: string): string {
  return patchRootTag(source, (tag) => setAttributeValue(tag, DATA_DURATION_ATTR_RE, newValue));
}

/** Write the derived-length marker, inserting it after the root's `data-duration`. */
export function patchRootDerivedDuration(source: string, value: string): string {
  return patchRootTag(source, (tag) =>
    DERIVED_DURATION_ATTR_RE.test(tag)
      ? setAttributeValue(tag, DERIVED_DURATION_ATTR_RE, value)
      : tag.replace(
          DATA_DURATION_ATTR_RE,
          (full, _prefix, quote: string) =>
            `${full} ${DERIVED_DURATION_ATTR}=${quote}${value}${quote}`,
        ),
  );
}

function setAttributeValue(tag: string, attribute: RegExp, value: string): string {
  return tag.replace(
    attribute,
    (_full, prefix: string, quote: string) => `${prefix}${quote}${value}${quote}`,
  );
}

function patchRootTag(source: string, patch: (tag: string) => string): string {
  const rootTag = ROOT_COMPOSITION_OPEN_TAG_RE.exec(source);
  if (!rootTag) return source;
  const patchedTag = patch(rootTag[0]);
  if (patchedTag === rootTag[0]) return source;
  return (
    source.slice(0, rootTag.index) + patchedTag + source.slice(rootTag.index + rootTag[0].length)
  );
}
