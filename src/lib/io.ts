import Papa from 'papaparse';
import type { AnnotationResult, CaseData } from '@/types';

/** Label Studio task shape (subset we read/write). */
export interface LSTask {
  id?: string | number;
  data: Record<string, string>;
  annotations?: { result: AnnotationResult[]; completed_by?: string }[];
  predictions?: { result: AnnotationResult[] }[];
}

/** One task's annotations across the selected users, for a collaborative export. */
export interface MultiUserCase {
  ID: string;
  data: Record<string, string>;
  /** One entry per selected user who annotated this task. */
  byUser: { email: string; results: AnnotationResult[] }[];
}

/** Normalize Excel/CSV line-ending quirks. */
export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .replace(/_x000D_/g, '\n')
    .replace(/\r/g, '');

/**
 * Stringify a row's values. When `textField` is given, its value is mirrored
 * into `text` so the labeling config's `$text` always resolves, regardless of
 * what the source column is named. When omitted, falls back to the legacy
 * `text`/`raw_text` convention.
 */
const stringifyRow = (
  row: Record<string, unknown>,
  textField?: string,
): Record<string, string> => {
  const data: Record<string, string> = {};
  for (const key of Object.keys(row)) data[key] = normalizeText(row[key]);
  if (textField) {
    if (textField !== 'text') data.text = data[textField] ?? '';
  } else if (!data.text && data.raw_text) {
    // Legacy default: the config references $text; alias raw_text.
    data.text = data.raw_text;
  }
  return data;
};

/** Distinct column keys present across rows, in first-seen order. The
 * `annotations` round-trip column is excluded — it is not annotatable text — as
 * are blank/whitespace-only headers (e.g. an unnamed trailing CSV column), which
 * aren't selectable as text or ID and break value-keyed pickers. */
export const columnsOf = (rows: Record<string, unknown>[]): string[] => {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === 'annotations' || key.trim() === '' || seen.has(key)) continue;
      seen.add(key);
      cols.push(key);
    }
  }
  return cols;
};

/** First non-empty value per column, for previewing a column's content. */
export const columnSamples = (
  rows: Record<string, unknown>[],
): Record<string, string> => {
  const samples: Record<string, string> = {};
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (samples[key]) continue;
      const value = normalizeText(row[key]);
      if (value) samples[key] = value;
    }
  }
  return samples;
};

/** Split a column header into word tokens, breaking on non-alphanumerics AND
 * camelCase / acronym boundaries: `note_id` -> [note, id], `noteID` ->
 * [note, ID], `RecordID` -> [Record, ID], `PatientGUID` -> [Patient, GUID]. */
const headerTokens = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ACRONYMWord boundary
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

/** Suggest which column holds the record ID. Scans columns left-to-right and
 * returns the first whose name contains "id" as a whole word — so `ID`, `id`,
 * `note_id`, `Note ID`, `patient_id`, `noteID`, and `RecordID` all match, while
 * `width`, `valid`, `candidate`, `idx`, and `guid` do not. Returns undefined
 * when nothing looks like an ID, so callers can fall back to auto-numbering. */
export const guessIdColumn = (columns: string[]): string | undefined =>
  columns.find((c) => headerTokens(c).some((t) => t.toLowerCase() === 'id'));

/** Suggest which column is most likely the main text. Honors the explicit
 * `text`/`raw_text` conventions first; otherwise picks the column with the
 * longest sample content, which is almost always the free-text field (e.g. an
 * EHR `clinical_note`) rather than an ID, code, or category. Length beats fuzzy
 * name matching, which trips on columns like `note_id`. */
export const guessTextColumn = (
  columns: string[],
  samples: Record<string, string> = {},
): string | undefined => {
  const exact =
    columns.find((c) => c === 'text') ?? columns.find((c) => c === 'raw_text');
  if (exact) return exact;

  const byLength = [...columns].sort(
    (a, b) => (samples[b]?.length ?? 0) - (samples[a]?.length ?? 0),
  );
  return byLength[0] ?? columns[0];
};

/** Resolve a row's external ID from the chosen `idField`:
 *   - `undefined` -> legacy behavior: use a column literally named `ID`;
 *   - `''`        -> none: ignore any ID column and let the caller auto-number;
 *   - a column    -> use that column's (trimmed) value.
 * Returns `''` when there's no usable value, signalling "auto-number me". */
const resolveId = (data: Record<string, string>, idField?: string): string => {
  const raw =
    idField === undefined ? data.ID : idField === '' ? undefined : data[idField];
  return (raw ?? '').trim();
};

/** Build cases from parsed CSV/XLSX rows. `textField` names the column holding
 * the text to annotate; `idField` names the column holding the record ID (see
 * `resolveId`). An `annotations` column (JSON array) is parsed back into results
 * so CSV exports round-trip. */
export const rowsToCases = (
  rows: Record<string, unknown>[],
  textField?: string,
  idField?: string,
): CaseData[] =>
  rows
    .map((row, i) => {
      const data = stringifyRow(row, textField);
      let results: AnnotationResult[] = [];
      if (data.annotations) {
        try {
          const parsed = JSON.parse(data.annotations);
          if (Array.isArray(parsed)) results = parsed;
        } catch {
          /* leave unannotated if the column is not valid JSON */
        }
      }
      delete data.annotations;
      return { ID: resolveId(data, idField) || `case-${i + 1}`, data, results };
    })
    .filter((c) => (c.data.text ?? '').length > 0);

/** Build cases from a Label Studio task JSON export (round-trip / re-import).
 * `textField` names the data field holding the text to annotate; `idField`
 * names the data field holding the record ID (see `resolveId`). */
export const tasksToCases = (
  tasks: LSTask[],
  textField?: string,
  idField?: string,
): CaseData[] =>
  tasks
    .map((task, i) => {
      const data = stringifyRow(task.data ?? {}, textField);
      const results =
        task.annotations?.[0]?.result ?? task.predictions?.[0]?.result ?? [];
      const ID =
        resolveId(data, idField) ||
        (task.id != null ? String(task.id) : `case-${i + 1}`);
      return { ID, data, results };
    })
    .filter((c) => (c.data.text ?? '').length > 0);

/** Serialize cases to Label Studio task JSON. */
export const casesToTasks = (cases: CaseData[]): LSTask[] =>
  cases.map((c) => ({
    data: { ID: c.ID, ...c.data },
    annotations: [{ result: c.results }],
  }));

/** Serialize cases to CSV: data columns + an `annotations` JSON column. */
export const casesToCsv = (cases: CaseData[]): string => {
  const rows = cases.map((c) => {
    const { ID: _ignored, ...rest } = c.data;
    return { ID: c.ID, ...rest, annotations: JSON.stringify(c.results) };
  });
  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const all = Array.from(keys);
  const priority = ['ID', 'text'];
  const fields = [
    ...priority.filter((f) => all.includes(f)),
    ...all.filter((f) => !priority.includes(f) && f !== 'annotations'),
    ...(all.includes('annotations') ? ['annotations'] : []),
  ];
  return Papa.unparse({ fields, data: rows });
};

/**
 * Serialize a collaborative export to Label Studio task JSON: each task carries
 * one `annotations` entry per selected user, tagged with `completed_by` (email),
 * matching how Label Studio represents multiple annotators per task.
 */
export const multiUserCasesToTasks = (cases: MultiUserCase[]): LSTask[] =>
  cases.map((c) => ({
    data: { ID: c.ID, ...c.data },
    annotations: c.byUser.map((u) => ({ completed_by: u.email, result: u.results })),
  }));

/**
 * Serialize a collaborative export to CSV: one row per (task, user) pair, with an
 * `annotator` column plus the per-user `annotations` JSON column. Round-trippable
 * through the CSV reader (rowsToCases). Tasks with no annotations are omitted.
 */
export const multiUserCasesToCsv = (cases: MultiUserCase[]): string => {
  const rows = cases.flatMap((c) => {
    const { ID: _ignored, ...rest } = c.data;
    return c.byUser.map((u) => ({
      ID: c.ID,
      ...rest,
      annotator: u.email,
      annotations: JSON.stringify(u.results),
    }));
  });

  const keys = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const all = Array.from(keys);
  const priority = ['ID', 'text', 'annotator'];
  const fields = [
    ...priority.filter((f) => all.includes(f)),
    ...all.filter((f) => !priority.includes(f) && f !== 'annotations'),
    ...(all.includes('annotations') ? ['annotations'] : []),
  ];
  return Papa.unparse({ fields, data: rows });
};

/** Trigger a browser download of text content. */
export const downloadText = (filename: string, text: string, mime = 'text/plain') => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Trigger a browser download of a JSON file. */
export const downloadJson = (filename: string, data: unknown) =>
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
