/**
 * Доступно backend — Cloudflare Worker entry.
 *   POST    /v1/describe   see describe.js
 *   OPTIONS /v1/describe   CORS preflight (the extension calls from its own origin)
 * Anything else: 404. Bad input: 400. Nothing here logs request bodies or the API key.
 */
import { describe, BadRequest, LIMITS } from './describe.js';
import { d1Cache } from './cache.js';
import { fetchImage } from './fetch-image.js';
import { makeDescribeImage, PROMPT_VERSION } from './model.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

/** Request body as text, or null once it exceeds maxBytes (without reading the rest). */
async function readBody(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(all);
}

/** Real dependencies from the Worker environment. */
export const depsFromEnv = (env) => ({
  fetchImage: (url) => fetchImage(url),
  describeImage: makeDescribeImage({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL }),
  cache: d1Cache(env.DB),
  now: () => Date.now(),
  model: env.MODEL,
  promptVersion: PROMPT_VERSION,
});

/** Handler factory; tests pass their own deps factory. */
export function createHandler(makeDeps = depsFromEnv) {
  return async function fetchHandler(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/v1/describe') return json(404, { error: 'not_found' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    const declared = Number(request.headers.get('content-length'));
    if (declared > LIMITS.maxBody) return json(400, { error: 'bad_request' });
    let body;
    try {
      const text = await readBody(request, LIMITS.maxBody); // stops reading past the limit
      if (text === null) return json(400, { error: 'bad_request' });
      body = JSON.parse(text);
    } catch (_) {
      return json(400, { error: 'bad_request' });
    }

    try {
      return json(200, await describe(body, makeDeps(env)));
    } catch (err) {
      if (err instanceof BadRequest) return json(400, { error: 'bad_request' });
      return json(500, { error: 'internal' }); // no details: they could include upstream messages
    }
  };
}

export default { fetch: createHandler() };
