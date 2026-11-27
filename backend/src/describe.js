/**
 * POST /v1/describe core, without HTTP or real dependencies (see index.js for wiring).
 *
 * Request:  { pageHost, lang: 'uk', items: [{ imageUrl, context? }] }   (1–8 items)
 * Response: { results: [{ alt: string | null, decorative: boolean, source }] }  same order
 *   source: 'cache' | 'ai' | 'refused' | 'none'
 *
 * Fails closed per item: privacy refusal, unsupported image, fetch or model failure all give
 * alt null; one item failing never fails the others.
 */
import { privacy } from './privacy.js';
import { cacheKey } from './cache.js';

export const LIMITS = Object.freeze({ maxItems: 8, maxContext: 300, maxUrl: 2048, maxBody: 16 * 1024 });
export const UNSUPPORTED_TTL_MS = 24 * 60 * 60 * 1000;
export const DESCRIBED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class BadRequest extends Error {}

const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (obj, allowed) => Object.keys(obj).every((k) => allowed.includes(k));

/** Validate a parsed body; throws BadRequest. Unknown keys are rejected (send nothing extra). */
export function validate(body) {
  if (!isPlainObject(body) || !onlyKeys(body, ['pageHost', 'lang', 'items'])) throw new BadRequest('body');
  const { pageHost, lang, items } = body;
  if (typeof pageHost !== 'string' || !HOST_RE.test(pageHost)) throw new BadRequest('pageHost');
  if (lang !== 'uk') throw new BadRequest('lang');
  if (!Array.isArray(items) || items.length < 1 || items.length > LIMITS.maxItems) throw new BadRequest('items');
  const clean = items.map((item) => {
    if (!isPlainObject(item) || !onlyKeys(item, ['imageUrl', 'context'])) throw new BadRequest('item');
    const { imageUrl, context = '' } = item;
    if (typeof imageUrl !== 'string' || !imageUrl || imageUrl.length > LIMITS.maxUrl) throw new BadRequest('imageUrl');
    if (typeof context !== 'string' || context.length > LIMITS.maxContext) throw new BadRequest('context');
    return { imageUrl, context };
  });
  return { pageHost, lang, items: clean };
}

const result = (alt, decorative, source) => ({ alt, decorative: !!decorative, source });
const REFUSED = () => result(null, false, 'refused');
const NONE = () => result(null, false, 'none');

async function describeOne(item, pageOk, deps) {
  const { fetchImage, describeImage, cache, now, model, promptVersion } = deps;
  if (!pageOk || !privacy.mayShareUrl(item.imageUrl)) return REFUSED();

  const key = await cacheKey(item.imageUrl, { promptVersion, model, context: item.context });
  // A cache outage is a miss, not a failure.
  const hit = await Promise.resolve()
    .then(() => cache.get(key, now()))
    .catch(() => null);
  if (hit) return hit.alt === null ? NONE() : result(hit.alt, hit.decorative, 'cache');

  const image = await fetchImage(item.imageUrl);
  if (!image.ok) {
    if (image.reason === 'unsupported') {
      await cache.put(key, { alt: null, decorative: false }, now(), UNSUPPORTED_TTL_MS).catch(() => {});
    }
    return image.reason === 'refused' ? REFUSED() : NONE();
  }

  const out = await describeImage({ bytes: image.bytes, mediaType: image.mediaType, context: item.context });
  if (!out) return NONE(); // refusal, error, bad output: not cached
  await cache.put(key, { alt: out.alt, decorative: out.decorative }, now(), DESCRIBED_TTL_MS).catch(() => {});
  return result(out.alt, out.decorative, 'ai');
}

/**
 * deps: { fetchImage(url), describeImage({bytes, mediaType, context}) -> {alt, decorative}|null,
 *         cache: { get(key, now), put(key, value, now, ttlMs?) }, now(), model, promptVersion }
 */
export async function describe(body, deps) {
  const { pageHost, items } = validate(body);
  const pageOk = privacy.mayShareFrom(`https://${pageHost}/`, { ai: true });
  const results = await Promise.all(
    items.map((item) => describeOne(item, pageOk, deps).catch(() => NONE())),
  );
  return { results };
}
