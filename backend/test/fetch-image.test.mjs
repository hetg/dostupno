import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchImage, sniffImageType } from '../src/fetch-image.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

/** Fake fetch: routes[url] = () => Response (a fresh one per call); records calls. */
const fakeFetch = (routes) => {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error('no route ' + url);
    return r(init);
  };
  fn.calls = calls;
  return fn;
};
const img = (bytes, type = 'image/png', extra = {}) => () =>
  new Response(bytes, { status: 200, headers: { 'content-type': type, ...extra } });
const redirect = (location) => () => new Response(null, { status: 302, headers: { location } });

test('sniffs image types from bytes, not headers', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(JPEG), 'image/jpeg');
  assert.equal(sniffImageType(new TextEncoder().encode('GIF89a')), 'image/gif');
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp');
  assert.equal(sniffImageType(SVG), null);
});

test('fetches a public PNG', async () => {
  const f = fakeFetch({ 'https://cdn.site.ua/a.png': img(PNG, 'application/octet-stream') });
  const r = await fetchImage('https://cdn.site.ua/a.png', { fetchFn: f });
  assert.equal(r.ok, true);
  assert.equal(r.mediaType, 'image/png', 'type from bytes even with a wrong header');
  assert.deepEqual([...r.bytes], [...PNG]);
});

test('SVG and other formats are unsupported', async () => {
  const f = fakeFetch({ 'https://cdn.site.ua/logo.svg': img(SVG, 'image/svg+xml') });
  assert.deepEqual(await fetchImage('https://cdn.site.ua/logo.svg', { fetchFn: f }), { ok: false, reason: 'unsupported' });
});

test('too big: by Content-Length or by actual bytes', async () => {
  const big = new Uint8Array(64).fill(1);
  big.set(PNG);
  const f = fakeFetch({
    'https://cdn.site.ua/declared.png': img(PNG, 'image/png', { 'content-length': '999999999' }),
    'https://cdn.site.ua/actual.png': img(big),
  });
  assert.equal((await fetchImage('https://cdn.site.ua/declared.png', { fetchFn: f })).reason, 'unsupported');
  assert.equal((await fetchImage('https://cdn.site.ua/actual.png', { fetchFn: f, maxBytes: 32 })).reason, 'unsupported');
});

test('redirects are followed by hand and re-checked', async () => {
  const f = fakeFetch({
    'https://site.ua/a.jpg': redirect('/img/a.jpg'),
    'https://site.ua/img/a.jpg': img(JPEG),
  });
  const r = await fetchImage('https://site.ua/a.jpg', { fetchFn: f });
  assert.equal(r.ok, true);
  assert.deepEqual(f.calls, ['https://site.ua/a.jpg', 'https://site.ua/img/a.jpg']);
});

test('redirect to an intranet host is not followed', async () => {
  const f = fakeFetch({ 'https://site.ua/a.jpg': redirect('http://10.0.0.5/a.jpg') });
  const r = await fetchImage('https://site.ua/a.jpg', { fetchFn: f });
  assert.deepEqual(r, { ok: false, reason: 'refused' });
  assert.deepEqual(f.calls, ['https://site.ua/a.jpg'], 'the intranet URL was never requested');
});

test('redirect to a signed URL is not followed', async () => {
  const f = fakeFetch({ 'https://site.ua/a.jpg': redirect('https://b.s3.amazonaws.com/a.jpg?X-Amz-Signature=x') });
  assert.equal((await fetchImage('https://site.ua/a.jpg', { fetchFn: f })).reason, 'refused');
});

test('more than 3 redirects fail', async () => {
  const f = fakeFetch({
    'https://site.ua/0': redirect('/1'), 'https://site.ua/1': redirect('/2'),
    'https://site.ua/2': redirect('/3'), 'https://site.ua/3': redirect('/4'),
    'https://site.ua/4': img(PNG),
  });
  assert.equal((await fetchImage('https://site.ua/0', { fetchFn: f })).reason, 'failed');
  assert.equal(f.calls.length, 4);
});

test('a refused starting URL is never fetched', async () => {
  const f = fakeFetch({});
  assert.equal((await fetchImage('http://192.168.1.1/cam.jpg', { fetchFn: f })).reason, 'refused');
  assert.equal(f.calls.length, 0);
});

test('HTTP errors, network errors and timeouts fail', async () => {
  const f = fakeFetch({
    'https://site.ua/404.png': () => new Response('no', { status: 404 }),
    'https://site.ua/slow.png': (init) => new Promise((_, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  assert.equal((await fetchImage('https://site.ua/404.png', { fetchFn: f })).reason, 'failed');
  assert.equal((await fetchImage('https://site.ua/boom.png', { fetchFn: f })).reason, 'failed');
  assert.equal((await fetchImage('https://site.ua/slow.png', { fetchFn: f, timeoutMs: 50 })).reason, 'failed');
});
