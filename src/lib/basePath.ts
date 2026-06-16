/**
 * When the app is served under a subpath behind a reverse proxy (e.g.
 * `sesame.bmi.emory.edu/bozlablabelapp/`), Next.js automatically prefixes
 * <Link>, next/navigation router, and next/image with `basePath` — but it does
 * NOT rewrite raw `fetch()` URL strings. So a `fetch('/api/...')` would hit the
 * domain root and 404. Wrap every app-absolute fetch URL in `api()` to add the
 * prefix.
 *
 * The value is inlined at build time from BASE_PATH (mirrored to
 * NEXT_PUBLIC_BASE_PATH in next.config.ts). When BASE_PATH is unset — the local
 * terminal-launch workflow served at the domain root — this is '' and `api()` is
 * a no-op.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Prefix an app-absolute path (one starting with '/') with the basePath. */
export function api(path: string): string {
  return `${BASE_PATH}${path}`;
}
