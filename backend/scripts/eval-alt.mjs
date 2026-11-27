/**
 * Quality check of AI alt text on real sites (test/sites.txt).
 *
 *   node backend/scripts/eval-alt.mjs                # dry run: list images + cost estimate, no API calls
 *   node backend/scripts/eval-alt.mjs --yes          # describe them with the real model (costs money)
 *   node backend/scripts/eval-alt.mjs --max 20 https://site.ua/   # fewer images / specific pages
 *
 * Collects images the extension would describe (flagged by the images fixer, page and URL allowed
 * by the privacy gate, with the same nearby-text context the ai-images fixer sends), then runs the
 * backend's own fetchImage + describeImage on them. Writes test/audit-report/alt-eval.md for a
 * human to review. The API key is read from backend/.dev.vars and never printed.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchImage } from '../src/fetch-image.js';
import { makeDescribeImage, PROMPT_VERSION } from '../src/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Same model as the Worker (wrangler.toml [vars] MODEL).
const MODEL = readFileSync(path.join(root, 'backend/wrangler.toml'), 'utf8').match(/^MODEL\s*=\s*"([^"]+)"/m)?.[1];
if (!MODEL) throw new Error('MODEL not found in backend/wrangler.toml');
const PER_SITE = 4;

const argv = process.argv.slice(2);
const yes = argv.includes('--yes');
const maxIdx = argv.indexOf('--max');
const MAX = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 50;
const urlArgs = argv.filter((a, i) => /^https?:\/\//.test(a) && argv[i - 1] !== '--max');
const urls = urlArgs.length
  ? urlArgs
  : readFileSync(path.join(root, 'test/sites.txt'), 'utf8').split('\n')
      .map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);

const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js.map((f) => readFileSync(path.join(root, 'extension', f), 'utf8'));
const shim = `
  window.chrome = {
    storage: { sync: { get: (d, cb) => cb({ ...d, profiles: { screenreader: true, lowvision: false } }) },
               onChanged: { addListener: () => {} } },
    runtime: { onMessage: { addListener: () => {} } },
  };`;

// ---------------------------------------------------------------------------
// 1. Collect candidate images (no API calls).
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({
  locale: 'uk-UA',
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});
const items = [];
const seen = new Set();
for (const url of urls) {
  if (items.length >= MAX) break;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    // Scroll through the page so lazy images load, then back to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < Math.min(document.body.scrollHeight, 12000); y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.addScriptTag({ content: shim });
    for (const s of scripts) await page.addScriptTag({ content: s });
    await page.waitForTimeout(800);
    const found = await page.evaluate((perSite) => {
      const D = window.Dostupno;
      const P = D.privacy;
      const flagged = [...document.querySelectorAll('img[data-dostupno-needs-ai="alt"]')];
      const stats = { images: document.images.length, flagged: flagged.length, urlRefused: [], page: 'ok' };
      if (!P.mayShareFrom(location.href, { ai: true })) stats.page = 'private site';
      else if (P.pageLooksPrivate(document)) stats.page = 'secret field on page';
      if (stats.page !== 'ok') return { out: [], stats };
      const out = [];
      for (const img of flagged) {
        const imageUrl = img.currentSrc || img.src;
        // Same filter as the ai-images fixer: tiny or invisible images aren't sent.
        const box = img.getBoundingClientRect();
        if (img.naturalWidth <= 24 || img.naturalHeight <= 24 || box.width < 24 || box.height < 24) continue;
        if (!P.mayShareUrl(imageUrl)) {
          stats.urlRefused.push(imageUrl.slice(0, 90));
          continue;
        }
        if (out.length < perSite) out.push({ imageUrl, context: D.aiContextFor(img), w: img.naturalWidth, h: img.naturalHeight });
      }
      return { out, stats };
    }, PER_SITE);
    const { out: candidates, stats } = found;
    for (const f of candidates) {
      if (seen.has(f.imageUrl) || items.length >= MAX) continue;
      seen.add(f.imageUrl);
      items.push({ site: new URL(url).hostname.replace(/^www\./, ''), ...f });
    }
    console.log(`${url}: ${candidates.length} candidate(s); ${stats.images} images, ${stats.flagged} flagged, ` +
      `${stats.urlRefused.length} URL(s) refused, page: ${stats.page}`);
    for (const u of stats.urlRefused.slice(0, 3)) console.log(`    refused: ${u}`);
  } catch (err) {
    console.log(`${url}: skipped (${String(err.message).split('\n')[0]})`);
  } finally {
    await page.close();
  }
}
await browser.close();

// Rough upper bound: ≤ 4,784 image tokens (high-res tier) + ~700 prompt tokens in, ~150 out.
const estimate = items.length * ((4784 + 700) * 0.10 + 150 * 0.50) / 1e6;
console.log(`\n${items.length} image(s). Estimated cost with ${MODEL}: at most $${estimate.toFixed(3)}.`);

if (!yes) {
  for (const it of items) console.log(`- [${it.site}] ${it.imageUrl}\n    context: ${it.context || '—'}`);
  console.log('\nDry run: no API calls. Re-run with --yes to describe them (costs money).');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Describe them with the real model.
// ---------------------------------------------------------------------------
const readKey = () => {
  try {
    const vars = readFileSync(path.join(root, 'backend/.dev.vars'), 'utf8');
    return (vars.match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return '';
  }
};
const apiKey = readKey();
if (!apiKey) {
  console.error('No ANTHROPIC_API_KEY in backend/.dev.vars.');
  process.exit(1);
}
const describeImage = makeDescribeImage({ apiKey, model: MODEL });

const results = new Array(items.length);
let next = 0;
const worker = async () => {
  while (next < items.length) {
    const i = next++;
    const it = items[i];
    const image = await fetchImage(it.imageUrl);
    if (!image.ok) {
      results[i] = { verdict: `none (${image.reason})`, alt: '' };
      continue;
    }
    const out = await describeImage({ bytes: image.bytes, mediaType: image.mediaType, context: it.context });
    results[i] = !out
      ? { verdict: 'none (model)', alt: '' }
      : out.decorative ? { verdict: 'decorative', alt: '' } : { verdict: 'described', alt: out.alt };
    process.stdout.write('.');
  }
};
await Promise.all([worker(), worker(), worker(), worker()]);
console.log();

const count = (v) => results.filter((r) => r.verdict.startsWith(v)).length;
const cell = (s) => String(s || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [
  `# AI alt text quality check`,
  '',
  `Model \`${MODEL}\`, prompt version ${PROMPT_VERSION}, ${new Date().toISOString().slice(0, 10)}.`,
  `${items.length} images: ${count('described')} described, ${count('decorative')} decorative, ${count('none')} without a description.`,
  '',
  'Review each row: is the sentence right, useful, short, without a label prefix, and does it avoid',
  'naming people the context doesn\'t name? Mark problems in the last column.',
  '',
  '| # | Site | Image | Context | Verdict | Alt text (shown with "ШІ: ") | Review |',
  '|---|---|---|---|---|---|---|',
  ...items.map((it, i) => `| ${i + 1} | ${it.site} | [image](${it.imageUrl}) ${it.w}×${it.h} | ${cell(it.context)} | ${results[i].verdict} | ${cell(results[i].alt)} | |`),
  '',
];
mkdirSync(path.join(root, 'test/audit-report'), { recursive: true });
writeFileSync(path.join(root, 'test/audit-report/alt-eval.md'), lines.join('\n'));
console.log(`Wrote test/audit-report/alt-eval.md (${count('described')} described, ${count('decorative')} decorative, ${count('none')} none).`);
