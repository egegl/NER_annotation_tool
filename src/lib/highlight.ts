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

/**
 * Data key under which import-time keyword-highlight spans are stashed on a
 * case's `data` (a JSON-encoded `Interval[]`, in the cleaned text's
 * coordinates). The `__` prefix marks it internal: it is hidden from the column
 * pickers and stripped from exports.
 */
export const KEYWORD_SPANS_KEY = '__keywordSpans';

/** Longest run of text treated as a single wrapped keyword. Marker pairs
 * farther apart than this are left unpaired, so a stray or asymmetric marker
 * can't bridge across a whole sentence and highlight unrelated text. Kept
 * comfortably above the longest real keyword phrase but well below sentence
 * length. */
const MAX_WRAPPED_KEYWORD_LEN = 40;

/**
 * A keyword wrapped in hash markers — `####cannabis####`, `#####CBD#####`, or a
 * phrase `####medical marijuana####`. Markers are runs of FOUR OR MORE `#`
 * (some snippets wrap a word in more than four), and the whole run is consumed
 * so no stray hashes are left behind. The captured keyword excludes `#` and
 * newlines and is length-bounded (MAX_WRAPPED_KEYWORD_LEN), so two distant
 * markers can't pair up and swallow the text between them. Assumes markers come
 * in pairs around a short keyword.
 */
const WRAPPED_TERM_RE = new RegExp(
  `#{4,}([^#\\n]{1,${MAX_WRAPPED_KEYWORD_LEN}})#{4,}`,
  'g',
);

/**
 * Strip `####keyword####` markers from `text`, returning the cleaned text (no
 * markers) and the character span of each unwrapped keyword in the cleaned
 * text's coordinates. Done at import so the stored note text is clean and
 * annotation offsets stay consistent, while the matched keywords can still be
 * highlighted at their exact positions.
 */
export const extractWrappedKeywords = (
  text: string,
): { cleanedText: string; spans: Interval[] } => {
  if (!text.includes('####')) return { cleanedText: text, spans: [] };
  let out = '';
  let last = 0;
  const spans: Interval[] = [];
  WRAPPED_TERM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WRAPPED_TERM_RE.exec(text)) !== null) {
    out += text.slice(last, m.index);
    const start = out.length;
    out += m[1];
    spans.push({ start, end: out.length });
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleanedText: out, spans };
};
