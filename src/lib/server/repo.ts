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

/** A project row by id, or null. */
export const getProjectById = (projectId: number): ProjectRow | null =>
  (getDb().prepare('SELECT * FROM project WHERE id = ?').get(projectId) as ProjectRow) ?? null;

/** The project a user is currently assigned to, or null (unassigned / none). */
export const getUserProject = (userId: number): ProjectRow | null =>
  (getDb()
    .prepare(
      `SELECT p.* FROM project p JOIN users u ON u.project_id = p.id WHERE u.id = ?`,
    )
    .get(userId) as ProjectRow) ?? null;

/** The id of the project a user is assigned to, or null. */
export const getUserProjectId = (userId: number): number | null =>
  ((getDb().prepare('SELECT project_id FROM users WHERE id = ?').get(userId) as
    | { project_id: number | null }
    | undefined)?.project_id ?? null);

/** Ordered task rows for a given project. */
export const getTasksForProject = (projectId: number): TaskRow[] =>
  getDb()
    .prepare('SELECT id, idx, external_id, data_json FROM tasks WHERE project_id = ? ORDER BY idx')
    .all(projectId) as TaskRow[];

export interface ProjectListItem {
  id: number;
  fileName: string;
  createdAt: string;
  createdBy: string | null;
  /** How many accounts are currently assigned to this project. */
  assignedCount: number;
  /** How many task rows (cases) it holds. */
  taskCount: number;
}

/** Every project, newest first, with assignment + size counts (admin pickers). */
export const listProjects = (): ProjectListItem[] =>
  getDb()
    .prepare(
      `SELECT p.id AS id,
              p.file_name AS fileName,
              p.created_at AS createdAt,
              p.created_by AS createdBy,
              (SELECT COUNT(*) FROM users u WHERE u.project_id = p.id) AS assignedCount,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS taskCount
         FROM project p
        ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all() as ProjectListItem[];

/**
 * Create a new project (labeling config + unannotated task rows) and assign the
 * given accounts to it. Accounts not listed keep whatever project they were on,
 * so their tasks and annotations are untouched. Cases are stripped of `results`
 * so assigned annotators start from a clean slate. Returns the new project id.
 */
export const createProjectAndAssign = (
  fileName: string,
  configXml: string,
  keywords: string,
  cases: CaseData[],
  createdBy: string,
  assignUserIds: number[],
): number => {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO project (file_name, config_xml, keywords, created_at, created_by)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(fileName, configXml, keywords, new Date().toISOString(), createdBy);
    const projectId = Number(info.lastInsertRowid);

    const insert = db.prepare(
      'INSERT INTO tasks (project_id, idx, external_id, data_json) VALUES (?, ?, ?, ?)',
    );
    cases.forEach((c, idx) => {
      insert.run(projectId, idx, c.ID, JSON.stringify(c.data));
    });

    if (assignUserIds.length > 0) {
      const assign = db.prepare('UPDATE users SET project_id = ? WHERE id = ?');
      for (const uid of assignUserIds) assign.run(projectId, uid);
    }
    return projectId;
  });
  return tx();
};

/**
 * Delete a project and everything under it: its tasks, and their annotations
 * and adjudications (all via ON DELETE CASCADE). Only allowed when no account is
 * assigned to it, so an actively-used project can't be wiped by accident;
 * reassign its accounts (Replace Project) first.
 */
export const deleteProject = (projectId: number): void => {
  const db = getDb();
  const assigned = (
    db.prepare('SELECT COUNT(*) AS n FROM users WHERE project_id = ?').get(projectId) as { n: number }
  ).n;
  if (assigned > 0) {
    throw new Error('Reassign this project’s accounts before deleting it.');
  }
  const result = db.prepare('DELETE FROM project WHERE id = ?').run(projectId);
  if (result.changes === 0) throw new Error('That project no longer exists.');
};

/** Update one project's labeling config (keeps its tasks + annotations intact). */
export const updateProjectConfig = (projectId: number, configXml: string) => {
  const result = getDb()
    .prepare('UPDATE project SET config_xml = ? WHERE id = ?')
    .run(configXml, projectId);
  if (result.changes === 0) throw new Error('No project to configure yet.');
};

/** Update one project's Reviewer Mode blind-adjudication setting. */
export const setReviewBlind = (projectId: number, blind: boolean) => {
  const result = getDb()
    .prepare('UPDATE project SET review_blind = ? WHERE id = ?')
    .run(blind ? 1 : 0, projectId);
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

/** Every user's non-empty annotations for one project, grouped for review. */
export const gatherReview = (projectId: number): ReviewGather => {
  const rows = getDb()
    .prepare(
      `SELECT a.task_id AS task_id, a.user_id AS user_id, u.email AS email, a.results_json AS results_json
         FROM annotations a
         JOIN users u ON u.id = a.user_id
         JOIN tasks t ON t.id = a.task_id
        WHERE t.project_id = ?
        ORDER BY a.user_id`,
    )
    .all(projectId) as { task_id: number; user_id: number; email: string; results_json: string }[];

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

/** Map of task id -> the adjudicated ground-truth results, for one project. */
export const getAdjudications = (projectId: number): Record<number, AnnotationResult[]> => {
  const rows = getDb()
    .prepare(
      `SELECT ad.task_id AS task_id, ad.results_json AS results_json
         FROM adjudications ad
         JOIN tasks t ON t.id = ad.task_id
        WHERE t.project_id = ?`,
    )
    .all(projectId) as { task_id: number; results_json: string }[];
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
  /** The project this account is assigned to, or null. */
  projectId: number | null;
  /** That project's file name, for display, or null when unassigned. */
  projectFile: string | null;
}

/** All users (with their assigned project), for admin pickers + management. */
export const listUsers = (): UserListItem[] =>
  getDb()
    .prepare(
      `SELECT u.id AS id, u.email AS email, u.role AS role,
              u.project_id AS projectId, p.file_name AS projectFile
         FROM users u
         LEFT JOIN project p ON p.id = u.project_id
        ORDER BY u.email`,
    )
    .all() as UserListItem[];

/** Delete an account by id. Its sessions and annotations cascade away (see the
 * `ON DELETE CASCADE` foreign keys), so this permanently removes that user's
 * annotation work. Caller is responsible for guardrails (self / last admin). */
export const deleteUser = (id: number): void => {
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
};

/**
 * Create a new account. Throws on invalid email or duplicate. A new account is
 * placed on `projectId` (typically the creating admin's current project) so it
 * joins the work in progress; pass null to leave it unassigned.
 */
export const createUser = async (
  rawEmail: string,
  password: string,
  role: Role = 'annotator',
  projectId: number | null = null,
): Promise<UserListItem> => {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new Error('Please enter a valid email address.');

  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('An account with this email already exists.');

  const record = await createPasswordRecord(password);
  const result = getDb()
    .prepare(
      `INSERT INTO users (email, role, salt, iterations, password_hash, created_at, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      email,
      role,
      record.salt,
      record.iterations,
      record.passwordHash,
      new Date().toISOString(),
      projectId,
    );

  const projectFile = projectId ? getProjectById(projectId)?.file_name ?? null : null;
  return { id: Number(result.lastInsertRowid), email, role, projectId, projectFile };
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
export const gatherExport = (
  projectId: number,
  userIds: number[],
  includeGroundTruth = false,
): ExportRow[] => {
  const tasks = getTasksForProject(projectId);
  const adjudications = includeGroundTruth ? getAdjudications(projectId) : {};
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
