import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { createHandler } from '../src/index.js';
import { memoryCache } from '../src/cache.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fakeDeps = () => ({
  fetchImage: async () => ({ ok: true, bytes: PNG, mediaType: 'image/png' }),
  describeImage: async () => ({ alt: 'Мапа області', decorative: false }),
  cache: memoryCache(),
  now: () => 0,
  model: 'claude-haiku-5-5',
  promptVersion: 1,
});
const handler = createHandler(fakeDeps);
const post = (body, headers = {}) =>
  handler(new Request('http://localhost/v1/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), {});

test('the default export is a Worker with fetch()', () => {
  assert.equal(typeof worker.fetch, 'function');
});

test('POST /v1/describe answers JSON with CORS', async () => {
  const res = await post({ pageHost: 'news.site.ua', lang: 'uk', items: [{ imageUrl: 'https://cdn.site.ua/a.png' }] });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { results: [{ alt: 'Мапа області', decorative: false, source: 'ai' }] });
});

test('CORS preflight', async () => {
  const res = await handler(new Request('http://localhost/v1/describe', { method: 'OPTIONS' }), {});
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-methods'), /POST/);
});

test('bad JSON, bad shape and oversized bodies are 400', async () => {
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post({ pageHost: 'news.site.ua', lang: 'uk', items: [] })).status, 400);
  // Every field within its own limit (8 items, URLs < 2048, context ≤ 300), body over 16 KB.
  const longUrl = 'https://cdn.site.ua/' + 'a'.repeat(1900) + '.png';
  const items = Array.from({ length: 8 }, () => ({ imageUrl: longUrl, context: 'я'.repeat(300) }));
  const big = JSON.stringify({ pageHost: 'news.site.ua', lang: 'uk', items });
  assert.ok(big.length > 16 * 1024);
  assert.equal((await post(big)).status, 400, 'over 16 KB even though each field is valid');
  // Streamed without Content-Length: reading stops at the limit.
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const res = await handler(new Request('http://localhost/v1/describe', { method: 'POST', body: stream, duplex: 'half' }), {});
  assert.equal(res.status, 400, 'streamed body over the limit');
  assert.equal((await post('{}', { 'content-length': '999999' })).status, 400, 'declared too big');
});

test('other paths and methods', async () => {
  assert.equal((await handler(new Request('http://localhost/'), {})).status, 404);
  assert.equal((await handler(new Request('http://localhost/v1/describe'), {})).status, 405);
});

test('unexpected errors are a bare 500 without details', async () => {
  const h = createHandler(() => { throw new Error('sk-ant-SECRET leaked?'); });
  const res = await h(new Request('http://localhost/v1/describe', {
    method: 'POST', body: JSON.stringify({ pageHost: 'news.site.ua', lang: 'uk', items: [{ imageUrl: 'https://cdn.site.ua/a.png' }] }),
  }), {});
  assert.equal(res.status, 500);
  assert.ok(!(await res.text()).includes('SECRET'));
});
