/**
 * When the app is served under a subpath behind a reverse proxy (e.g.
 * `https://example.com/myapp/`), Next.js automatically prefixes
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

/**
 * Build a fetch URL for an app-absolute path (one starting with '/'): prepend
 * the basePath and append a trailing slash before any query string.
 *
 * The trailing slash matches `trailingSlash: true` in next.config.ts — with it,
 * the canonical URL for every route (API route handlers included) ends in '/',
 * so hitting the slashed form directly avoids a 308 redirect on every request.
 */
export function api(path: string): string {
  const [p, query] = path.split('?');
  const withSlash = p.endsWith('/') ? p : `${p}/`;
  return `${BASE_PATH}${withSlash}${query ? `?${query}` : ''}`;
}
