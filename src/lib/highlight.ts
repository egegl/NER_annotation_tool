/** A half-open character range [start, end) within a text. */
export interface Interval {
  start: number;
  end: number;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True if [s, e) overlaps any of the (unsorted) region intervals. */
const intersectsRegion = (s: number, e: number, regions: Interval[]): boolean =>
  regions.some((r) => s < r.end && e > r.start);

/**
 * Find all case-insensitive occurrences of `query` in `text`, excluding any
 * match that overlaps an existing label region (those characters are already
 * coloured, and "search to find text to label" rarely targets labelled spans).
 * Matches are returned left-to-right and never overlap.
 */
export const findMatches = (
  text: string,
  query: string,
  regions: Interval[] = [],
): Interval[] => {
  const q = query.trim();
  if (!q) return [];
  const re = new RegExp(escapeRegExp(q), 'gi');
  const out: Interval[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (!intersectsRegion(start, end, regions)) out.push({ start, end });
  }
  return out;
};

/**
 * Find all occurrences of any watchlist `terms` in `text` (case-insensitive),
 * excluding matches that overlap a label region. Longer terms take precedence
 * over shorter ones so multi-word terms aren't fragmented.
 */
export const findKeywordMatches = (
  text: string,
  terms: string[],
  regions: Interval[] = [],
): Interval[] => {
  const cleaned = Array.from(
    new Set(terms.map((t) => t.trim()).filter(Boolean)),
  ).sort((a, b) => b.length - a.length);
  if (cleaned.length === 0) return [];
  const re = new RegExp(cleaned.map(escapeRegExp).join('|'), 'gi');
  const out: Interval[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (!intersectsRegion(start, end, regions)) out.push({ start, end });
  }
  return out;
};

/** Parse a free-form watchlist entry (commas or newlines) into terms. */
export const parseTerms = (raw: string): string[] =>
  raw
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
