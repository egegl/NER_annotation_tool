#!/usr/bin/env node
/**
 * Seed the SQLite users table for the annotation tool.
 *
 *  - Imports any accounts from src/config/accounts.json (hashes preserved, so
 *    existing credentials keep working).
 *  - Optionally bootstraps one account from CLI flags. Since accounts.json ships
 *    empty, this is how you create the first admin:
 *
 *      node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin
 *
 * The database file location matches src/lib/db.ts: $DATA_DIR/annotation.db
 * (default ./data/annotation.db).
 */

import Database from 'better-sqlite3';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(PROJECT_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'annotation.db');
const ACCOUNTS_PATH = path.join(PROJECT_ROOT, 'src', 'config', 'accounts.json');
const DEFAULT_ITERATIONS = 200000;

const parseArgs = () => {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) args[key.slice(2)] = argv[i + 1];
  }
  return args;
};

const normalizeEmail = (value) => value.trim().toLowerCase();

const derive = (password) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, 32, 'sha256');
  return {
    salt: salt.toString('base64'),
    iterations: DEFAULT_ITERATIONS,
    passwordHash: hash.toString('base64'),
  };
};

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    role          TEXT NOT NULL DEFAULT 'annotator',
    salt          TEXT NOT NULL,
    iterations    INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
`);

const upsert = db.prepare(`
  INSERT INTO users (email, role, salt, iterations, password_hash, created_at)
  VALUES (@email, @role, @salt, @iterations, @passwordHash, @createdAt)
  ON CONFLICT (email) DO UPDATE SET
    role = excluded.role,
    salt = excluded.salt,
    iterations = excluded.iterations,
    password_hash = excluded.password_hash
`);

let imported = 0;

// 1) Import accounts.json (hashes preserved).
if (existsSync(ACCOUNTS_PATH)) {
  const config = JSON.parse(readFileSync(ACCOUNTS_PATH, 'utf-8'));
  for (const [rawEmail, record] of Object.entries(config.users ?? {})) {
    upsert.run({
      email: normalizeEmail(rawEmail),
      role: record.role === 'admin' ? 'admin' : 'annotator',
      salt: record.salt,
      iterations: record.iterations ?? DEFAULT_ITERATIONS,
      passwordHash: record.passwordHash,
      createdAt: new Date().toISOString(),
    });
    imported += 1;
    console.log(`imported ${normalizeEmail(rawEmail)} (${record.role ?? 'annotator'})`);
  }
}

// 2) Bootstrap an account from CLI flags.
const args = parseArgs();
if (args.email && args.password) {
  const email = normalizeEmail(args.email);
  const role = args.role === 'admin' ? 'admin' : 'annotator';
  upsert.run({ email, role, ...derive(args.password), createdAt: new Date().toISOString() });
  console.log(`bootstrapped ${email} (${role})`);
} else if (imported === 0) {
  console.log(
    'Nothing to seed. Pass --email and --password to create the first admin, e.g.\n' +
      "  node scripts/seed_db.mjs --email you@example.com --password 'secret' --role admin",
  );
}

console.log(`\nDatabase: ${DB_PATH}`);
db.close();
