import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, validate, BadRequest, UNSUPPORTED_TTL_MS, DESCRIBED_TTL_MS, LIMITS } from '../src/describe.js';
import { memoryCache, d1Cache, cacheKey } from '../src/cache.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Fake dependencies that record what happened. */
const setup = ({ images = {}, answers = {}, now = 1_000_000 } = {}) => {
  const fetched = [];
  const described = [];
  const deps = {
    cache: memoryCache(),
    now: () => now,
    model: 'claude-haiku-5-5',
    promptVersion: 1,
    fetchImage: async (url) => {
      fetched.push(url);
      return images[url] ?? { ok: true, bytes: PNG, mediaType: 'image/png' };
    },
    describeImage: async ({ context }) => {
      described.push(context);
      const a = answers[context];
      if (a instanceof Error) throw a;
      return a === undefined ? { alt: 'Діти саджають дерева біля школи', decorative: false } : a;
    },
  };
  return { deps, fetched, described };
};

const body = (items, pageHost = 'news.site.ua') => ({ pageHost, lang: 'uk', items });

test('two images: one result each, in order', async () => {
  const { deps } = setup({ answers: { b: { alt: '', decorative: true } } });
  const r = await describe(body([
    { imageUrl: 'https://cdn.site.ua/a.jpg', context: 'a' },
    { imageUrl: 'https://cdn.site.ua/b.png', context: 'b' },
  ]), deps);
  assert.deepEqual(r.results, [
    { alt: 'Діти саджають дерева біля школи', decorative: false, source: 'ai' },
    { alt: '', decorative: true, source: 'ai' },
  ]);
});

test('malformed requests are rejected before anything is fetched', async () => {
  const { deps, fetched } = setup();
  const item = { imageUrl: 'https://cdn.site.ua/a.jpg', context: '' };
  const bad = [
    null, [], 'x',
    body([]),
    body(Array.from({ length: LIMITS.maxItems + 1 }, () => item)),
    body([{ imageUrl: 'https://cdn.site.ua/a.jpg', context: 'x'.repeat(301) }]),
    body([{ imageUrl: 42 }]),
    body([{ imageUrl: '' }]),
    body([{ ...item, html: '<button>' }]), // unknown item field: never accept extra data
    { ...body([item]), cookies: 'x' }, // unknown top-level field
    { ...body([item]), lang: 'ru' },
    body([item], 'news.site.ua/path'),
    body([item], 'https://news.site.ua'),
    body([item], ''),
  ];
  for (const b of bad) {
    await assert.rejects(() => describe(b, deps), BadRequest, JSON.stringify(b)?.slice(0, 80));
  }
  assert.equal(fetched.length, 0);
});

test('validate keeps only the allowed fields and defaults context', () => {
  assert.deepEqual(validate(body([{ imageUrl: 'https://cdn.site.ua/a.jpg' }])), {
    pageHost: 'news.site.ua', lang: 'uk', items: [{ imageUrl: 'https://cdn.site.ua/a.jpg', context: '' }],
  });
});

test('a request from a private page refuses everything without fetching', async () => {
  for (const host of ['privatbank.ua', 'mail.google.com', 'wiki.corp', '192.168.1.1', 'abc.onion']) {
    const { deps, fetched, described } = setup();
    const r = await describe(body([{ imageUrl: 'https://cdn.site.ua/a.jpg' }], host), deps)
      .catch((e) => (e instanceof BadRequest ? { results: [{ source: 'refused' }] } : Promise.reject(e)));
    assert.equal(r.results[0].source, 'refused', host);
    assert.equal(fetched.length + described.length, 0, host);
  }
});

test('a refused image URL is skipped, the others still work', async () => {
  const { deps, fetched } = setup();
  const r = await describe(body([
    { imageUrl: 'https://b.s3.amazonaws.com/a.jpg?X-Amz-Signature=x', context: 'a' },
    { imageUrl: 'https://cdn.site.ua/b.jpg', context: 'b' },
  ]), deps);
  assert.deepEqual(r.results.map((x) => x.source), ['refused', 'ai']);
  assert.deepEqual(fetched, ['https://cdn.site.ua/b.jpg']);
});

test('unsupported images: no model call, cached for a day', async () => {
  const url = 'https://cdn.site.ua/logo.svg';
  const { deps, described } = setup({ images: { [url]: { ok: false, reason: 'unsupported' } } });
  const r = await describe(body([{ imageUrl: url }]), deps);
  assert.deepEqual(r.results[0], { alt: null, decorative: false, source: 'none' });
  assert.equal(described.length, 0);
  const key = await cacheKey(url, deps);
  assert.equal(deps.cache.rows.get(key).expiresAt, 1_000_000 + UNSUPPORTED_TTL_MS);
});

test('redirect refused by privacy rules gives a refused result', async () => {
  const url = 'https://site.ua/a.jpg';
  const { deps } = setup({ images: { [url]: { ok: false, reason: 'refused' } } });
  assert.equal((await describe(body([{ imageUrl: url }]), deps)).results[0].source, 'refused');
});

test('model refusal or error gives no description and is not cached', async () => {
  const { deps } = setup({ answers: { refused: null, boom: new Error('401 invalid x-api-key sk-ant-SECRET') } });
  const r = await describe(body([
    { imageUrl: 'https://cdn.site.ua/a.jpg', context: 'refused' },
    { imageUrl: 'https://cdn.site.ua/b.jpg', context: 'boom' },
    { imageUrl: 'https://cdn.site.ua/c.jpg', context: 'ok' },
  ]), deps);
  assert.deepEqual(r.results.map((x) => x.source), ['none', 'none', 'ai']);
  assert.equal(deps.cache.rows.size, 1, 'only the success is cached');
  assert.ok(!JSON.stringify(r).includes('SECRET'), 'errors never leak into the response');
});

test('fetch failures are isolated and not cached', async () => {
  const bad = 'https://cdn.site.ua/404.jpg';
  const { deps } = setup({ images: { [bad]: { ok: false, reason: 'failed' } } });
  const r = await describe(body([{ imageUrl: bad }, { imageUrl: 'https://cdn.site.ua/ok.jpg' }]), deps);
  assert.deepEqual(r.results.map((x) => x.source), ['none', 'ai']);
  assert.equal(deps.cache.rows.size, 1);
});

test('second visitor gets the cached description without fetching', async () => {
  const { deps, fetched, described } = setup();
  const b = body([{ imageUrl: 'https://cdn.site.ua/a.jpg', context: 'x' }]);
  await describe(b, deps);
  const r = await describe(b, deps);
  assert.equal(r.results[0].source, 'cache');
  assert.equal(r.results[0].alt, 'Діти саджають дерева біля школи');
  assert.equal(fetched.length, 1);
  assert.equal(described.length, 1);
});

test('changing the prompt version or model ignores earlier entries', async () => {
  const { deps, described } = setup();
  const b = body([{ imageUrl: 'https://cdn.site.ua/a.jpg' }]);
  await describe(b, deps);
  await describe(b, { ...deps, promptVersion: 2 });
  await describe(b, { ...deps, model: 'claude-sonnet-5-5' });
  assert.equal(described.length, 3);
});

test('context is part of the key: made-up context for a popular image does not reach other users', async () => {
  const { deps, described } = setup({ answers: { 'На фото Іван Петренко': { alt: 'Іван Петренко на трибуні', decorative: false } } });
  const url = 'https://cdn.site.ua/mayor.jpg';
  await describe(body([{ imageUrl: url, context: 'На фото Іван Петренко' }]), deps); // the "attacker"
  const real = await describe(body([{ imageUrl: url, context: 'Відкриття школи №5' }]), deps); // a real page
  assert.equal(real.results[0].source, 'ai', 'the real page does not get the planted description');
  assert.equal(real.results[0].alt, 'Діти саджають дерева біля школи');
  assert.equal(described.length, 2);
  const again = await describe(body([{ imageUrl: url, context: 'Відкриття школи №5' }]), deps);
  assert.equal(again.results[0].source, 'cache', 'same image + same context is shared');
});

test('descriptions expire after 30 days', async () => {
  let now = 1_000_000;
  const { deps, described } = setup();
  deps.now = () => now;
  const b = body([{ imageUrl: 'https://cdn.site.ua/kurs.png', context: 'Курс валют' }]);
  await describe(b, deps);
  now += DESCRIBED_TTL_MS - 1;
  assert.equal((await describe(b, deps)).results[0].source, 'cache');
  now += 2;
  assert.equal((await describe(b, deps)).results[0].source, 'ai', 'described again after 30 days');
  assert.equal(described.length, 2);
});

test('an expired unsupported entry is retried', async () => {
  const url = 'https://cdn.site.ua/later.png';
  let now = 1_000_000;
  const { deps, fetched } = setup({ images: { [url]: { ok: false, reason: 'unsupported' } } });
  deps.now = () => now;
  await describe(body([{ imageUrl: url }]), deps);
  await describe(body([{ imageUrl: url }]), deps);
  assert.equal(fetched.length, 1, 'cached within the day');
  now += UNSUPPORTED_TTL_MS + 1;
  await describe(body([{ imageUrl: url }]), deps);
  assert.equal(fetched.length, 2, 'retried after it expired');
});

test('a broken cache is treated as a miss', async () => {
  const { deps } = setup();
  deps.cache = { get: async () => { throw new Error('D1 down'); }, put: async () => { throw new Error('D1 down'); } };
  const r = await describe(body([{ imageUrl: 'https://cdn.site.ua/a.jpg' }]), deps);
  assert.equal(r.results[0].source, 'ai');
});

test('cache key: hex sha256 that changes with prompt version, model, URL and context', async () => {
  const k = await cacheKey('https://cdn.site.ua/a.jpg', { promptVersion: 1, model: 'm' });
  assert.match(k, /^[0-9a-f]{64}$/);
  assert.notEqual(k, await cacheKey('https://cdn.site.ua/a.jpg', { promptVersion: 2, model: 'm' }));
  assert.notEqual(k, await cacheKey('https://cdn.site.ua/a.jpg', { promptVersion: 1, model: 'n' }));
  assert.notEqual(k, await cacheKey('https://cdn.site.ua/b.jpg', { promptVersion: 1, model: 'm' }));
  assert.notEqual(k, await cacheKey('https://cdn.site.ua/a.jpg', { promptVersion: 1, model: 'm', context: 'x' }));
});

test('d1Cache: reads, writes, and ignores expired rows', async () => {
  const rows = new Map();
  const fakeD1 = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async () => {
          const r = rows.get(args[0]);
          return r ? { alt: r[1], decorative: r[2], expires_at: r[4] } : null;
        },
        run: async () => {
          assert.match(sql, /^INSERT OR REPLACE INTO descriptions/);
          rows.set(args[0], args);
        },
      }),
    }),
  };
  const c = d1Cache(fakeD1);
  await c.put('k1', { alt: 'Опис', decorative: false }, 100);
  await c.put('k2', { alt: null, decorative: false }, 100, 50);
  assert.deepEqual(await c.get('k1', 10_000), { alt: 'Опис', decorative: false });
  assert.deepEqual(await c.get('k2', 120), { alt: null, decorative: false });
  assert.equal(await c.get('k2', 151), null, 'expired');
  assert.equal(await c.get('missing', 0), null);
});
