/**
 * Test helpers for AI descriptions:
 *  - startMockBackend(): a stand-in for the Worker's POST /v1/describe. Records every request
 *    (so tests can check exactly what left the browser) and answers by image URL:
 *      ".../decor..." → decorative, ".../swap..." → SWAP_ALT, ".../slow..." → answer after 1.5 s,
 *      else ALT.
 *  - png(w, h): a real solid-colour PNG, big enough not to count as a decorative pixel.
 */
import { createServer } from 'node:http';
import { deflateSync, crc32 } from 'node:zlib';

export const ALT = 'Діти саджають дерева біля школи';
export const SWAP_ALT = 'Нова світлина з галереї';

export function png(width = 160, height = 120) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function startMockBackend() {
  const requests = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  const server = createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/describe') {
      res.writeHead(404, cors);
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, cors);
        res.end();
        return;
      }
      requests.push(body);
      const results = (body.items || []).map(({ imageUrl }) =>
        /decor/.test(imageUrl) ? { alt: '', decorative: true, source: 'ai' }
          : /swap/.test(imageUrl) ? { alt: SWAP_ALT, decorative: false, source: 'ai' }
            : { alt: ALT, decorative: false, source: 'ai' });
      const delay = (body.items || []).some(({ imageUrl }) => /slow/.test(imageUrl)) ? 1500 : 0;
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json', ...cors });
        res.end(JSON.stringify({ results }));
      }, delay);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
