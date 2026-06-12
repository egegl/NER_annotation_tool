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

const stringifyRow = (row: Record<string, unknown>): Record<string, string> => {
  const data: Record<string, string> = {};
  for (const key of Object.keys(row)) data[key] = normalizeText(row[key]);
  // Default config references $text; alias raw_text so common exports work.
  if (!data.text && data.raw_text) data.text = data.raw_text;
  return data;
};

/** Build cases from parsed CSV/XLSX rows. An `annotations` column (JSON array)
 * is parsed back into results so CSV exports round-trip. */
export const rowsToCases = (rows: Record<string, unknown>[]): CaseData[] =>
  rows
    .map((row, i) => {
      const data = stringifyRow(row);
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
      return { ID: data.ID || `case-${i + 1}`, data, results };
    })
    .filter((c) => (c.data.text ?? '').length > 0);

/** Build cases from a Label Studio task JSON export (round-trip / re-import). */
export const tasksToCases = (tasks: LSTask[]): CaseData[] =>
  tasks.map((task, i) => {
    const data = stringifyRow(task.data ?? {});
    const results =
      task.annotations?.[0]?.result ?? task.predictions?.[0]?.result ?? [];
    const ID = data.ID || (task.id != null ? String(task.id) : `case-${i + 1}`);
    return { ID, data, results };
  });

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
