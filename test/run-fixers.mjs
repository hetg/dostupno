/**
 * Smoke test: loads the fixture page in Chromium, injects the content scripts
 * with a fake chrome.storage, and checks that the fixes were applied and that
 * turning the site off reverts everything.
 *
 * Run: npm test   (from the repo root, after `npm install`)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const scripts = manifest.content_scripts[0].js.map((f) => readFileSync(path.join(root, 'extension', f), 'utf8'));

const chromeShim = `
  window.__store = { enabled: true, profiles: { screenreader: true, lowvision: true }, disabledSites: [] };
  window.__listeners = [];
  window.chrome = {
    storage: {
      sync: { get: (d, cb) => cb({ ...d, ...window.__store }) },
      onChanged: { addListener: (fn) => window.__listeners.push(fn) },
    },
    runtime: { onMessage: { addListener: () => {} } },
  };
  window.__setStore = (patch) => {
    const changes = {};
    for (const k in patch) { changes[k] = { newValue: patch[k] }; window.__store[k] = patch[k]; }
    window.__listeners.forEach((fn) => fn(changes, 'sync'));
  };
`;

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  → ' + detail}`);
  if (!ok) failed++;
};

// Controls whose name we check. Names come from Chromium's accessibility tree,
// i.e. what a screen reader is actually given, not from our own accessibleName().
const NAMED = {
  logo: '#logo-link',
  search: '.icon-search',
  burger: '.burger-menu',
  tel: 'a[href^="tel:"]',
  fb: 'a[href*="facebook"]',
  close: 'header button:last-of-type',
  searchSubmit: 'form[role=search] button',
  qField: 'input[name=q]',
  email: 'input[name=email]',
  phone: 'input[name=phone]',
  alreadyNamed: '#named',
  exampleEmail: 'input[name=contact]',
  examplePhone: 'input[name=mob]',
  videoCard: '#video-card a.video-item',
  photoCard: '#photo-card a',
  ytVideo: '#yt-video',
  closeSearch: '#close-search',
  owlPrev: '#owl-prev',
  lateButton: '.close-modal',
  figureImg: 'figure img',
};
// Already named in the fixture on purpose; everything else must start unnamed.
const NAMED_BY_SITE = new Set(['alreadyNamed', 'owlPrev']);

const browser = await chromium.launch();
const page = await browser.newPage();
const fixture = 'file://' + path.join(root, 'test/fixtures/broken.html');
await page.goto(fixture);

const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('Accessibility.enable');
/** Accessible name as computed by Chromium (null if the element doesn't exist). */
const axName = async (selector) => {
  const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector });
  if (!nodeId) return null;
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  return (nodes[0]?.name?.value ?? '').trim();
};
const axNames = async () => {
  const out = {};
  for (const [key, sel] of Object.entries(NAMED)) out[key] = await axName(sel);
  return out;
};

// The fixture must really be broken, or the checks below prove nothing. Chromium falls
// back to the placeholder or a lone symbol ("🔍", "×"); neither is a meaningful name.
const before = await axNames();
const placeholders = await page.evaluate((named) => {
  const out = {};
  for (const [key, sel] of Object.entries(named)) out[key] = document.querySelector(sel)?.getAttribute('placeholder') ?? null;
  return out;
}, NAMED);
const meaningful = (k, v) => v && /[\p{L}\p{N}]/u.test(v) && v !== placeholders[k];
const namedTooEarly = Object.entries(before).filter(([k, v]) => meaningful(k, v) && !NAMED_BY_SITE.has(k) && k !== 'figureImg');
check('fixture: controls start without a meaningful name (per Chromium)', namedTooEarly.length === 0, JSON.stringify(namedTooEarly));

await page.addScriptTag({ content: chromeShim });
for (const s of scripts) await page.addScriptTag({ content: s });
await page.waitForTimeout(1500); // let the delayed content appear and get fixed

// Contrast only looks at text on screen: the far paragraph must be untouched until seen.
const farBefore = await page.evaluate(() => getComputedStyle(document.getElementById('far')).color);
// Scroll through the page like a reader would, then back to the top.
for (const sel of ['#later', '#edge', '#far']) {
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  await page.waitForTimeout(300);
}
await page.evaluate(() => scrollTo(0, 0));

const r = await page.evaluate(() => {
  const D = window.Dostupno;
  const q = (s) => document.querySelector(s);
  const color = (s) => getComputedStyle(q(s)).color;
  return {
    lang: document.documentElement.lang,
    figure: q('figure img').getAttribute('alt'),
    filenameImg: q('img[alt="IMG_2041.jpg"]')?.getAttribute('data-dostupno-needs-ai'),
    pixel: q('img[width="1"]').getAttribute('alt'),
    paleRatio: D.contrastRatio(
      ...[color('.pale'), 'rgb(255,255,255)'].map((c) => { const m = c.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; })
    ),
    darkBoxRatio: D.contrastRatio(
      ...[color('.dark-box p'), 'rgb(28,28,28)'].map((c) => { const m = c.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; })
    ),
    latePale: color('#later .pale'),
    focusStyle: !!document.getElementById('dostupno-focus'),
    greenText: color('.green-btn'),
    greenRatio: D.contrastRatio(
      ...[color('.green-btn'), getComputedStyle(q('.green-btn')).backgroundColor].map((c) => { const m = c.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; })
    ),
    onImage: color('.card p'),
    srOnly: color('.sr-only'),
    ghost: color('.ghost'),
    hiddenPale: color('[hidden] .pale'),
    far: color('#far'),
    untouched: q('main > p:not([class])').hasAttribute('data-dostupno'),
    changes: D.changes.count(),
  };
});

// What screen readers get, from Chromium's accessibility tree.
Object.assign(r, await axNames());
// Our simplified accessibleName() decides what's "missing"; it must agree with the browser.
const ours = await page.evaluate((named) => {
  const out = {};
  for (const [key, sel] of Object.entries(named)) {
    const el = document.querySelector(sel);
    if (el) out[key] = window.Dostupno.accessibleName(el);
  }
  return out;
}, NAMED);
const disagree = Object.keys(ours).filter((k) => k !== 'figureImg' && ours[k] !== r[k]).map((k) => `${k}: ours "${ours[k]}" vs Chromium "${r[k]}"`);
check('accessibleName() agrees with Chromium on every checked control', disagree.length === 0, disagree.join('; '));

check('lang detected as uk', r.lang === 'uk', r.lang);
check('logo link named', r.logo === 'Головна сторінка', r.logo);
check('search icon button named', r.search === 'Пошук', r.search);
check('burger named', r.burger === 'Меню', r.burger);
check('tel link named', r.tel.startsWith('Зателефонувати'), r.tel);
check('facebook link named', r.fb === 'Facebook', r.fb);
check('× button named', r.close === 'Закрити', r.close);
check('search submit named', r.searchSubmit === 'Шукати', r.searchSubmit);
check('search field labeled from placeholder', r.qField === 'Пошук по сайту', r.qField);
check('email labeled from nearby text', r.email === 'Електронна пошта', r.email);
check('phone labeled from name', r.phone === 'Телефон', r.phone);
check('figure image exposed with its caption as name', r.figureImg === 'Відкриття нового укриття у школі №5', r.figureImg);
check('figure image uses caption', r.figure === 'Відкриття нового укриття у школі №5', r.figure);
check('filename alt flagged for AI', r.filenameImg === 'alt', r.filenameImg);
check('1px image marked decorative', r.pixel === '', r.pixel);
check('existing name kept', r.alreadyNamed === 'Вже має назву', r.alreadyNamed);
check('example e-mail placeholder not used as label', r.exampleEmail === 'Електронна пошта', r.exampleEmail);
check('phone mask placeholder not used as label', r.examplePhone === 'Телефон', r.examplePhone);
check('video icon link named from its card title', r.videoCard === 'Відео: Відкриття нової школи у громаді', r.videoCard);
check('image link named from same-target headline', r.photoCard === 'Ремонт дороги на вулиці Шевченка', r.photoCard);
check('close-search button named as closing', r.closeSearch === 'Закрити пошук', r.closeSearch);
check('name from a labelled child kept', r.owlPrev === 'Previous', r.owlPrev);
check('YouTube video link named as a video', r.ytVideo === 'Відео на YouTube', r.ytVideo);
check('pale text now ≥ 4.5:1', r.paleRatio >= 4.5, r.paleRatio.toFixed(2));
check('dark box text now ≥ 4.5:1', r.darkBoxRatio >= 4.5, r.darkBoxRatio.toFixed(2));
check('late-added button named', r.lateButton === 'Закрити', r.lateButton);
check('late-added pale text fixed', r.latePale !== 'rgb(181, 181, 181)', r.latePale);
check('focus style injected', r.focusStyle);
check('fine paragraph untouched', !r.untouched);
check('white text on green button stays white', r.greenText === 'rgb(255, 255, 255)', r.greenText);
check('green button background darkened to ≥ 4.5:1', r.greenRatio >= 4.5, r.greenRatio.toFixed(2));
check('text over an image untouched', r.onImage === 'rgb(221, 221, 221)', r.onImage);
check('screen-reader-only text untouched', r.srOnly === 'rgb(204, 204, 204)', r.srOnly);
check('near-invisible text untouched (background unknown)', r.ghost === 'rgb(250, 250, 250)', r.ghost);
check('hidden text untouched', r.hiddenPale === 'rgb(181, 181, 181)', r.hiddenPale);
check('off-screen text untouched until scrolled to', farBefore === 'rgb(181, 181, 181)', farBefore);
check('off-screen text fixed once seen', r.far !== 'rgb(181, 181, 181)', r.far);

// Turning the site off must revert everything.
const after = await page.evaluate(() => {
  window.__setStore({ disabledSites: [location.hostname] });
  return {
    changes: window.Dostupno.changes.count(),
    lang: document.documentElement.getAttribute('lang'),
    marked: document.querySelectorAll('[data-dostupno]').length,
    styles: document.querySelectorAll('[data-dostupno-style]').length,
    pale: getComputedStyle(document.querySelector('.pale')).color,
    greenBg: getComputedStyle(document.querySelector('.green-btn')).backgroundColor,
    needsAi: document.querySelectorAll('[data-dostupno-needs-ai]').length,
  };
});
check('revert: change log empty', after.changes === 0, after.changes);
check('revert: lang removed', after.lang === null, after.lang);
check('revert: no marked elements', after.marked === 0, after.marked);
check('revert: styles removed', after.styles === 0, after.styles);
check('revert: original color back', after.pale === 'rgb(181, 181, 181)', after.pale);
check('revert: button background back', after.greenBg === 'rgb(0, 160, 70)', after.greenBg);
check('revert: AI markers removed', after.needsAi === 0, after.needsAi);

// A contrast check scheduled before turning off must not touch the reverted page.
await page.evaluate(() => document.getElementById('far').scrollIntoView());
await page.waitForTimeout(500);
const late = await page.evaluate(() => ({
  changes: window.Dostupno.changes.count(),
  far: getComputedStyle(document.getElementById('far')).color,
}));
check('after revert: no new changes', late.changes === 0 && late.far === 'rgb(181, 181, 181)', JSON.stringify(late));

console.log(`\n${r.changes} changes applied before revert. ${failed ? failed + ' check(s) failed' : 'All checks passed.'}`);
await browser.close();
process.exit(failed ? 1 : 0);
