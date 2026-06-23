import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Single SQLite connection for the whole server process. The database lives in a
 * single file (DATA_DIR/annotation.db, default ./data) so a self-hosted instance
 * is trivial to back up and move. WAL mode lets multiple annotators read/write
 * concurrently without lock contention.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

const DB_PATH = path.join(DATA_DIR, 'annotation.db');

let db: Database.Database | null = null;

const initSchema = (database: Database.Database) => {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  // When several server processes share the one database file (each annotator
  // launches their own `next start` against the shared DATA_DIR), a write can
  // briefly find the database locked by another process. Without a busy timeout
  // SQLite fails immediately with SQLITE_BUSY; with it, the write waits and
  // retries for up to 15s, which is far longer than any contention here lasts.
  database.pragma('busy_timeout = 15000');

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      role          TEXT NOT NULL DEFAULT 'annotator',
      salt          TEXT NOT NULL,
      iterations    INTEGER NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      file_name   TEXT NOT NULL,
      config_xml  TEXT NOT NULL,
      keywords    TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL,
      created_by  TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
      idx         INTEGER NOT NULL,
      external_id TEXT NOT NULL,
      data_json   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, idx);

    CREATE TABLE IF NOT EXISTS annotations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      results_json TEXT NOT NULL,
      updated_at   TEXT NOT NULL,
      UNIQUE (task_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
  `);

  // Migration: older databases predate the project `keywords` column (admin-set
  // always-highlight keywords). Add it in place so existing projects keep working.
  const projectCols = database.prepare(`PRAGMA table_info(project)`).all() as { name: string }[];
  if (!projectCols.some((c) => c.name === 'keywords')) {
    database.exec(`ALTER TABLE project ADD COLUMN keywords TEXT NOT NULL DEFAULT ''`);
  }
};

/** Lazily open (and initialise) the shared database connection. */
export const getDb = (): Database.Database => {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
};

export const DB_FILE = DB_PATH;
