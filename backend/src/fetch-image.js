/**
 * Fetch an image for the model, safely.
 *  - every URL, including each redirect target, must pass the privacy gate's item rules
 *  - at most 3 redirects, followed by hand (redirect: 'manual') so each hop is checked
 *  - a timeout and a 5 MB limit (Content-Length and the actual bytes)
 *  - only JPEG, PNG, GIF and WebP, decided from the file's first bytes (servers often
 *    send the wrong Content-Type)
 *
 * Returns one of:
 *   { ok: true, bytes: Uint8Array, mediaType }
 *   { ok: false, reason: 'unsupported' }  wrong type or too big (may be cached for a day)
 *   { ok: false, reason: 'refused' }      a URL or redirect the privacy rules refuse
 *   { ok: false, reason: 'failed' }       network error, timeout, HTTP error (not cached)
 */
import { privacy } from './privacy.js';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const TIMEOUT_MS = 5000; // + 6 s model stays under the extension's 15 s

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/** Media type from magic bytes, or null. */
export const sniffImageType = (b) => {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
};

/** Read a response body up to maxBytes; returns null when it is bigger. */
const readLimited = async (response, maxBytes) => {
  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.length > maxBytes ? null : buf;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      reader.cancel().catch(() => {}); // don't wait: stop reading and move on
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

export async function fetchImage(url, { fetchFn = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      if (!privacy.mayShareUrl(current)) return { ok: false, reason: 'refused' };
      const response = await fetchFn(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'image/jpeg,image/png,image/gif,image/webp;q=0.9,*/*;q=0.1',
          'user-agent': 'Dostupno/0.1 (accessibility alt text)',
        },
      });
      const release = () => response.body?.cancel().catch(() => {}); // free the connection
      if (REDIRECT.has(response.status)) {
        release();
        const location = response.headers.get('location');
        if (!location || hop >= MAX_REDIRECTS) return { ok: false, reason: 'failed' };
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) {
        release();
        return { ok: false, reason: 'failed' };
      }
      const length = Number(response.headers.get('content-length'));
      if (length > maxBytes) {
        release();
        return { ok: false, reason: 'unsupported' };
      }
      const bytes = await readLimited(response, maxBytes);
      if (!bytes) return { ok: false, reason: 'unsupported' };
      const mediaType = sniffImageType(bytes);
      if (!mediaType) return { ok: false, reason: 'unsupported' };
      return { ok: true, bytes, mediaType };
    }
  } catch (_) {
    return { ok: false, reason: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
