import 'server-only';
import { getDb } from '@/lib/db';
import type { AnnotationResult, CaseData } from '@/types';
import {
  createPasswordRecord,
  isValidEmail,
  normalizeEmail,
  type Role,
} from '@/lib/server/auth';

// ---------------------------------------------------------------------------
// Project + tasks
// ---------------------------------------------------------------------------

export interface ProjectRow {
  id: number;
  file_name: string;
  config_xml: string;
  /** Admin-set always-highlight keywords (free-form: newlines or commas). */
  keywords: string;
  /** 1 = Reviewer Mode masks annotator identities ("Annotator 1/2"). */
  review_blind: number;
  created_at: string;
  created_by: string | null;
}

export interface TaskRow {
  id: number;
  idx: number;
  external_id: string;
  data_json: string;
}

/** The single project (id = 1), or null when nothing has been uploaded yet. */
export const getProject = (): ProjectRow | null =>
  (getDb().prepare('SELECT * FROM project WHERE id = 1').get() as ProjectRow) ?? null;

/** Ordered task rows for the current project. */
export const getTasks = (): TaskRow[] =>
  getDb()
    .prepare('SELECT id, idx, external_id, data_json FROM tasks WHERE project_id = 1 ORDER BY idx')
    .all() as TaskRow[];

/**
 * Replace the project: store the labeling config + the unannotated task rows,
 * discarding all previously stored tasks and every user's annotations (cascade).
 * Cases are stripped of their `results` so everyone starts from a clean slate.
 */
export const replaceProject = (
  fileName: string,
  configXml: string,
  keywords: string,
  cases: CaseData[],
  createdBy: string,
) => {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM project WHERE id = 1').run(); // cascades to tasks + annotations
    db.prepare(
      `INSERT INTO project (id, file_name, config_xml, keywords, created_at, created_by)
       VALUES (1, ?, ?, ?, ?, ?)`,
    ).run(fileName, configXml, keywords, new Date().toISOString(), createdBy);

    const insert = db.prepare(
      'INSERT INTO tasks (project_id, idx, external_id, data_json) VALUES (1, ?, ?, ?)',
    );
    cases.forEach((c, idx) => {
      insert.run(idx, c.ID, JSON.stringify(c.data));
    });
  });
  tx();
};

/** Update only the shared labeling config (keeps tasks + annotations intact). */
export const updateConfig = (configXml: string) => {
  const result = getDb()
    .prepare('UPDATE project SET config_xml = ? WHERE id = 1')
    .run(configXml);
  if (result.changes === 0) throw new Error('No project to configure yet.');
};

/** Update the Reviewer Mode blind-adjudication setting. */
export const setReviewBlind = (blind: boolean) => {
  const result = getDb()
    .prepare('UPDATE project SET review_blind = ? WHERE id = 1')
    .run(blind ? 1 : 0);
  if (result.changes === 0) throw new Error('No project to configure yet.');
};

// ---------------------------------------------------------------------------
// Annotations (per user)
// ---------------------------------------------------------------------------

/** Map of task id -> the given user's results for that task. */
export const getUserAnnotations = (userId: number): Record<number, AnnotationResult[]> => {
  const rows = getDb()
    .prepare('SELECT task_id, results_json FROM annotations WHERE user_id = ?')
    .all(userId) as { task_id: number; results_json: string }[];
  const out: Record<number, AnnotationResult[]> = {};
  for (const row of rows) {
    try {
      out[row.task_id] = JSON.parse(row.results_json);
    } catch {
      out[row.task_id] = [];
    }
  }
  return out;
};

/** Upsert a single (task, user) annotation. */
export const saveUserAnnotation = (
  taskId: number,
  userId: number,
  results: AnnotationResult[],
) => {
  getDb()
    .prepare(
      `INSERT INTO annotations (task_id, user_id, results_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (task_id, user_id)
       DO UPDATE SET results_json = excluded.results_json, updated_at = excluded.updated_at`,
    )
    .run(taskId, userId, JSON.stringify(results), new Date().toISOString());
};

// ---------------------------------------------------------------------------
// Review (admin adjudication)
// ---------------------------------------------------------------------------

export interface ReviewGather {
  /** Users with at least one non-empty annotation, ordered by user id (the
   * order gives blind mode its stable "Annotator N" numbering). */
  annotators: { userId: number; email: string }[];
  /** task id -> user id -> that user's non-empty results. */
  byTask: Map<number, Map<number, AnnotationResult[]>>;
}

/** Every user's non-empty annotations, grouped for the admin review stream. */
export const gatherReview = (): ReviewGather => {
  const rows = getDb()
    .prepare(
      `SELECT a.task_id AS task_id, a.user_id AS user_id, u.email AS email, a.results_json AS results_json
         FROM annotations a JOIN users u ON u.id = a.user_id
        ORDER BY a.user_id`,
    )
    .all() as { task_id: number; user_id: number; email: string; results_json: string }[];

  const annotators: { userId: number; email: string }[] = [];
  const seen = new Set<number>();
  const byTask = new Map<number, Map<number, AnnotationResult[]>>();
  for (const row of rows) {
    let results: AnnotationResult[] = [];
    try {
      results = JSON.parse(row.results_json);
    } catch {
      /* skip malformed */
    }
    if (results.length === 0) continue;
    if (!seen.has(row.user_id)) {
      seen.add(row.user_id);
      annotators.push({ userId: row.user_id, email: row.email });
    }
    const perUser = byTask.get(row.task_id) ?? new Map<number, AnnotationResult[]>();
    perUser.set(row.user_id, results);
    byTask.set(row.task_id, perUser);
  }
  return { annotators, byTask };
};

/** Map of task id -> the adjudicated ground-truth results for that task. */
export const getAdjudications = (): Record<number, AnnotationResult[]> => {
  const rows = getDb()
    .prepare('SELECT task_id, results_json FROM adjudications')
    .all() as { task_id: number; results_json: string }[];
  const out: Record<number, AnnotationResult[]> = {};
  for (const row of rows) {
    try {
      out[row.task_id] = JSON.parse(row.results_json);
    } catch {
      out[row.task_id] = [];
    }
  }
  return out;
};

/** Upsert one task's ground-truth decision (one adjudication per task). */
export const saveAdjudication = (
  taskId: number,
  reviewerId: number,
  results: AnnotationResult[],
) => {
  getDb()
    .prepare(
      `INSERT INTO adjudications (task_id, reviewer_id, results_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (task_id)
       DO UPDATE SET reviewer_id = excluded.reviewer_id, results_json = excluded.results_json, updated_at = excluded.updated_at`,
    )
    .run(taskId, reviewerId, JSON.stringify(results), new Date().toISOString());
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface UserListItem {
  id: number;
  email: string;
  role: Role;
}

/** All users, for the admin export picker and account management. */
export const listUsers = (): UserListItem[] =>
  getDb()
    .prepare('SELECT id, email, role FROM users ORDER BY email')
    .all() as UserListItem[];

/** Delete an account by id. Its sessions and annotations cascade away (see the
 * `ON DELETE CASCADE` foreign keys), so this permanently removes that user's
 * annotation work. Caller is responsible for guardrails (self / last admin). */
export const deleteUser = (id: number): void => {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
};

/** Create a new account. Throws on invalid email or duplicate. */
export const createUser = async (
  rawEmail: string,
  password: string,
  role: Role = 'annotator',
): Promise<UserListItem> => {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address.');

  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('An account with this email already exists.');

  const record = await createPasswordRecord(password);
  const result = getDb()
    .prepare(
      `INSERT INTO users (email, role, salt, iterations, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(email, role, record.salt, record.iterations, record.passwordHash, new Date().toISOString());

  return { id: Number(result.lastInsertRowid), email, role };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportRow {
  task: TaskRow;
  byUser: { email: string; results: AnnotationResult[] }[];
}

/** Annotator name used for adjudicated ground truth in exports. */
export const GROUND_TRUTH_NAME = 'ground_truth';

/**
 * Gather, for the selected users, each task plus the (task, user) annotations.
 * Tasks always appear (even with no annotations) so the export reflects the full
 * dataset; only the selected users contribute annotation entries. With
 * `includeGroundTruth`, each adjudicated task additionally gets a leading
 * GROUND_TRUTH_NAME entry (leading so single-annotation re-imports prefer it).
 */
export const gatherExport = (userIds: number[], includeGroundTruth = false): ExportRow[] => {
  const tasks = getTasks();
  const adjudications = includeGroundTruth ? getAdjudications() : {};
  const groundTruthFor = (taskId: number): ExportRow['byUser'] => {
    const results = adjudications[taskId];
    return results && results.length > 0 ? [{ email: GROUND_TRUTH_NAME, results }] : [];
  };

  if (userIds.length === 0) {
    return tasks.map((task) => ({ task, byUser: groundTruthFor(task.id) }));
  }

  const db = getDb();
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT a.task_id AS task_id, u.email AS email, a.results_json AS results_json
         FROM annotations a JOIN users u ON u.id = a.user_id
        WHERE a.user_id IN (${placeholders})`,
    )
    .all(...userIds) as { task_id: number; email: string; results_json: string }[];

  const byTask = new Map<number, { email: string; results: AnnotationResult[] }[]>();
  for (const row of rows) {
    let results: AnnotationResult[] = [];
    try {
      results = JSON.parse(row.results_json);
    } catch {
      /* skip malformed */
    }
    if (results.length === 0) continue;
    const list = byTask.get(row.task_id) ?? [];
    list.push({ email: row.email, results });
    byTask.set(row.task_id, list);
  }

  return tasks.map((task) => ({
    task,
    byUser: [...groundTruthFor(task.id), ...(byTask.get(task.id) ?? [])],
  }));
};
