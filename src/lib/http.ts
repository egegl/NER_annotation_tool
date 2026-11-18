/**
 * Client-side helpers for talking to the app's API through the reverse proxy.
 *
 * The API itself always answers in JSON, but the proxy in front of it (nginx on
 * the shared gateway) answers some failures with its own HTML page: 413 when a
 * request body is over `client_max_body_size`, 502/504 when the Node server is
 * down or slow. Calling `res.json()` on those throws "Unexpected token '<' ...
 * is not valid JSON", which hides the real cause. `readJson` reports the HTTP
 * status in words instead.
 */

const describeStatus = (status: number): string => {
  switch (status) {
    case 401:
      return 'Your session has expired. Please log in again.';
    case 403:
      return 'You do not have permission to do that.';
    case 413:
      return 'The request is larger than the server accepts (HTTP 413).';
    case 502:
    case 503:
      return `The annotation server is not responding (HTTP ${status}). Please try again in a moment.`;
    case 504:
      return 'The server took too long to answer (HTTP 504). Please try again.';
    default:
      return status >= 200 && status < 300
        ? 'The server sent an unexpected response.'
        : `Request failed (HTTP ${status}).`;
  }
};

/**
 * Parse a response body as JSON. Throws an Error with the API's own `error`
 * message when there is one, and otherwise a plain description of the HTTP
 * status (also when a 2xx response is not JSON, e.g. a proxy login page).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const apiError =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  if (!res.ok || body === null) throw new Error(apiError ?? describeStatus(res.status));
  return body as T;
}

/**
 * Split items into consecutive groups whose JSON stays under `maxBytes` (UTF-8),
 * so each group can be sent in its own request below the proxy's body limit
 * (nginx defaults to 1 MB). Order is kept. An item that is larger than the
 * budget on its own still gets a group of its own.
 */
export function chunkByJsonSize<T>(items: T[], maxBytes: number): T[][] {
  const encoder = new TextEncoder();
  const chunks: T[][] = [];
  let current: T[] = [];
  let size = 2; // the enclosing []
  for (const item of items) {
    const itemSize = encoder.encode(JSON.stringify(item)).length + 1; // + comma
    if (current.length > 0 && size + itemSize > maxBytes) {
      chunks.push(current);
      current = [];
      size = 2;
    }
    current.push(item);
    size += itemSize;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
