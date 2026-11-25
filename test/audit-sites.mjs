/**
 * Real-site audit: opens each URL in Chromium, injects the content scripts
 * (both profiles on), and records every change each fixer makes, with enough
 * context to judge whether it was right. Use the report to hunt false positives.
 *
 * Run:   npm run audit                      (all sites in test/sites.txt)
 *        npm run audit -- https://example.ua (specific URLs)
 *        SHOTS=1 npm run audit -- …         (also before/after pictures of contrast fixes)
 * Output: test/audit-report/<host>.json, <host>.png (with SHOTS) and summary.md
 *
 * Nothing is sent anywhere except normal page loads; no AI calls.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const [coreFile, ...rest] = manifest.content_scripts[0].js;
const read = (f) => readFileSync(path.join(root, 'extension', f), 'utf8');
const core = read(coreFile);
const others = rest.map(read);

const outDir = path.join(root, 'test/audit-report');
mkdirSync(outDir, { recursive: true });

const urls = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readFileSync(path.join(root, 'test/sites.txt'), 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter(Boolean);

const chromeShim = `
  window.chrome = {
    storage: {
      sync: { get: (d, cb) => cb({ ...d, enabled: true, profiles: { screenreader: true, lowvision: true }, disabledSites: [] }) },
      onChanged: { addListener: () => {} },
    },
    runtime: { onMessage: { addListener: () => {} } },
  };
`;

// Runs in the page after core.js, before the fixers: wraps the change API
// so every change is recorded with the fixer that made it.
const recorder = `
  (() => {
    const D = window.Dostupno;
    const rec = (window.__audit = { changes: [], ai: [], timings: {}, errors: [] });
    window.__auditEls = []; // elements changed by contrast, for before/after pictures
    let current = null;
    const snippet = (el) => {
      const clone = el.cloneNode(true);
      let html = clone.outerHTML || '';
      html = html.replace(/\\s+/g, ' ');
      return html.length > 400 ? html.slice(0, 400) + '…' : html;
    };
    const context = (el) => {
      const p = el.closest('header, nav, footer, form, main, aside, [role]') ;
      return p ? p.tagName.toLowerCase() + (p.className && typeof p.className === 'string' ? '.' + p.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') : '';
    };
    const origRegister = D.registerFixer;
    D.registerFixer = (f) => origRegister({
      ...f,
      run(r, ctx) {
        current = f.id;
        const t = performance.now();
        try { return f.run(r, ctx); }
        finally { rec.timings[f.id] = (rec.timings[f.id] || 0) + performance.now() - t; current = null; }
      },
    });
    const { setAttr, setStyle } = D.changes;
    D.changes.setAttr = (el, name, value) => {
      if (el.getAttribute(name) !== value) rec.changes.push({
        fixer: current, kind: 'attr', name, old: el.getAttribute(name), value,
        tag: el.tagName.toLowerCase(), html: snippet(el), context: context(el),
      });
      return setAttr(el, name, value);
    };
    D.changes.setStyle = (el, prop, value) => {
      window.__auditEls.push(el);
      rec.changes.push({
        // Outside run() means a deferred check; only contrast does that today.
        fixer: current || 'contrast', kind: 'style', name: prop, old: getComputedStyle(el)[prop], value,
        tag: el.tagName.toLowerCase(), text: D.clean(el.textContent).slice(0, 80),
        fontSize: getComputedStyle(el).fontSize, context: context(el),
        visible: el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : null,
        rect: (({ width, height }) => [Math.round(width), Math.round(height)])(el.getBoundingClientRect()),
        bgChain: (() => { const out = []; for (let n = el; n && n.nodeType === 1 && out.length < 6; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') out.push(n.tagName.toLowerCase() + '.' + String(n.className).slice(0, 30) + ' ' + cs.backgroundColor + (cs.backgroundImage !== 'none' ? ' IMG' : '') + (cs.transitionDuration !== '0s' ? ' T=' + cs.transitionProperty.slice(0, 30) : '')); } return out; })(),
      });
      return setStyle(el, prop, value);
    };
    const origWarn = console.warn;
    console.warn = (...a) => { if (String(a[0]).includes('Доступно')) rec.errors.push(a.map(String).join(' ')); origWarn(...a); };
  })();
`;

const collectAi = () =>
  [...document.querySelectorAll('[data-dostupno-needs-ai]')].map((el) => {
    let html = el.outerHTML.replace(/\s+/g, ' ');
    if (html.length > 300) html = html.slice(0, 300) + '…';
    return { need: el.getAttribute('data-dostupno-needs-ai'), tag: el.tagName.toLowerCase(), html };
  });

/**
 * Picture of up to 10 contrast fixes: each row is "before | after".
 * Background fixes come first since they change the design the most.
 */
async function beforeAfter(page, file) {
  const n = await page.evaluate(() => {
    const els = [...new Set(window.__auditEls)].filter((e) => e.isConnected);
    const bg = els.filter((e) => e.style.getPropertyValue('background-color'));
    window.__shotEls = [...bg, ...els.filter((e) => !bg.includes(e))].slice(0, 10);
    return window.__shotEls.length;
  });
  if (!n) return;
  const clips = [];
  const grab = async () => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const box = await page.evaluate((i) => {
        const el = window.__shotEls[i];
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: Math.min(r.width + 24, 600), height: Math.min(r.height + 24, 160) };
      }, i);
      out.push(box.width > 0 && box.height > 0 ? (await page.screenshot({ clip: box })).toString('base64') : null);
    }
    return out;
  };
  const after = await grab();
  await page.evaluate(() => {
    for (const f of window.Dostupno.fixers) f.stop?.();
    window.Dostupno.changes.revertAll();
  });
  const before = await grab();
  for (let i = 0; i < n; i++) clips.push([before[i], after[i]]);
  const sheet = await page.context().newPage();
  await sheet.setContent(
    '<body style="margin:0;font:12px sans-serif;background:#888"><table cellspacing=6>' +
      '<tr><th>before</th><th>after</th></tr>' +
      clips.map(([b, a]) => `<tr><td>${b ? `<img src="data:image/png;base64,${b}">` : ''}</td><td>${a ? `<img src="data:image/png;base64,${a}">` : ''}</td></tr>`).join('') +
      '</table></body>'
  );
  await sheet.locator('table').screenshot({ path: file });
  await sheet.close();
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: 'uk-UA',
  viewport: { width: 1366, height: 900 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
});

const summary = [];
for (const url of urls) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const page = await context.newPage();
  const row = { url, host };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // roughly document_idle + late widgets
    const title = await page.title();
    if ((response && response.status() >= 400) || /access denied|forbidden|just a moment|attention required/i.test(title))
      throw new Error(`blocked (${response?.status()} "${title}")`);
    await page.addScriptTag({ content: chromeShim });
    await page.addScriptTag({ content: core });
    await page.addScriptTag({ content: recorder });
    for (const s of others) await page.addScriptTag({ content: s });
    // Read the page like a user: scroll down a few screens (lazy content ->
    // MutationObserver path; contrast only checks text that is on screen).
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1000);
    const audit = await page.evaluate(() => window.__audit);
    if (!audit) throw new Error('page navigated away during the audit');
    audit.ai = await page.evaluate(collectAi);
    audit.lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    writeFileSync(path.join(outDir, host + '.json'), JSON.stringify({ url, ...audit }, null, 2));
    if (process.env.SHOTS) await beforeAfter(page, path.join(outDir, host + '.png'));

    const byFixer = {};
    for (const c of audit.changes) byFixer[c.fixer] = (byFixer[c.fixer] || 0) + 1;
    Object.assign(row, {
      changes: audit.changes.length,
      byFixer,
      ai: audit.ai.length,
      ms: Object.fromEntries(Object.entries(audit.timings).map(([k, v]) => [k, Math.round(v)])),
      errors: audit.errors.length,
    });
    console.log(`✓ ${host}: ${audit.changes.length} changes, ${audit.ai.length} need AI`);
  } catch (err) {
    row.error = String(err.message || err).split('\n')[0];
    console.log(`✗ ${host}: ${row.error}`);
  }
  summary.push(row);
  await page.close();
}
await browser.close();

const fixers = ['lang', 'images', 'names', 'forms', 'contrast', 'focus'];
const lines = [
  '# Audit summary',
  '',
  `| site | ${fixers.join(' | ')} | needs AI | slowest fixer | errors |`,
  `|---|${fixers.map(() => '---').join('|')}|---|---|---|`,
];
for (const r of summary) {
  if (r.error) { lines.push(`| ${r.host} | ${fixers.map(() => '').join(' | ')} | | | ${r.error} |`); continue; }
  const slow = Object.entries(r.ms).sort((a, b) => b[1] - a[1])[0];
  lines.push(
    `| ${r.host} | ${fixers.map((f) => r.byFixer[f] || 0).join(' | ')} | ${r.ai} | ${slow ? `${slow[0]} ${slow[1]}ms` : ''} | ${r.errors} |`
  );
}
writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
