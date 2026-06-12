import 'server-only';
import { cookies } from 'next/headers';
import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getDb } from '@/lib/db';

const pbkdf2 = promisify(pbkdf2Cb);

export type Role = 'admin' | 'annotator';

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

export const SESSION_COOKIE = 'annotator-session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const DEFAULT_ITERATIONS = 200000;

/**
 * Mark the session cookie `Secure` (HTTPS-only) in production. Set
 * INSECURE_COOKIES=true when the instance is served over plain HTTP (e.g. an
 * internal cluster URL with no TLS), otherwise browsers drop the cookie and
 * login silently fails. Always prefer real HTTPS in front when possible.
 */
const useSecureCookie =
  process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true';

interface UserRow {
  id: number;
  email: string;
  role: string;
  salt: string;
  iterations: number;
  password_hash: string;
}

const roleOf = (value: string): Role => (value === 'admin' ? 'admin' : 'annotator');

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Derive a base64 PBKDF2-SHA256 hash. Matches the parameters used by both the
 * original browser auth (auth.ts) and scripts/manage_accounts.py, so existing
 * password hashes remain valid after they are seeded into the database.
 */
const derivePasswordHash = async (
  password: string,
  saltB64: string,
  iterations: number,
): Promise<string> => {
  const salt = Buffer.from(saltB64, 'base64');
  const derived = await pbkdf2(password, salt, iterations, 32, 'sha256');
  return derived.toString('base64');
};

/** Create the {salt, iterations, passwordHash} triple for a new password. */
export const createPasswordRecord = async (password: string) => {
  const salt = randomBytes(16).toString('base64');
  const iterations = DEFAULT_ITERATIONS;
  const passwordHash = await derivePasswordHash(password, salt, iterations);
  return { salt, iterations, passwordHash };
};

/** Verify email+password against the users table. Returns the user or null. */
export const verifyLogin = async (
  rawEmail: string,
  password: string,
): Promise<SessionUser | null> => {
  const email = normalizeEmail(rawEmail);
  const row = getDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email) as UserRow | undefined;
  if (!row) return null;

  const hash = await derivePasswordHash(password, row.salt, row.iterations);
  const expected = Buffer.from(row.password_hash, 'base64');
  const actual = Buffer.from(hash, 'base64');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return { id: row.id, email: row.email, role: roleOf(row.role) };
};

/** Create a session row and set the httpOnly cookie. */
export const createSession = async (userId: number) => {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  getDb()
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt.toISOString());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookie,
    path: '/',
    expires: expiresAt,
  });
};

/** Delete the current session row and clear the cookie. */
export const destroySession = async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  store.delete(SESSION_COOKIE);
};

/** Resolve the logged-in user from the session cookie, or null. */
export const getSessionUser = async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.role, s.expires_at AS expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .get(token) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, email: row.email, role: roleOf(row.role) };
};

/** Guard helpers: return the user or throw an HttpError with a status code. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const requireUser = async (): Promise<SessionUser> => {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Not authenticated.');
  return user;
};

export const requireAdmin = async (): Promise<SessionUser> => {
  const user = await requireUser();
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
  return user;
};
