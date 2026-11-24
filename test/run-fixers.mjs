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

const browser = await chromium.launch();
const page = await browser.newPage();
const fixture = 'file://' + path.join(root, 'test/fixtures/broken.html');
await page.goto(fixture);
await page.addScriptTag({ content: chromeShim });
for (const s of scripts) await page.addScriptTag({ content: s });
await page.waitForTimeout(1500); // let the delayed content appear and get fixed

const r = await page.evaluate(() => {
  const D = window.Dostupno;
  const q = (s) => document.querySelector(s);
  const name = (s) => D.accessibleName(q(s));
  const color = (s) => getComputedStyle(q(s)).color;
  return {
    lang: document.documentElement.lang,
    logo: name('#logo-link'),
    search: name('.icon-search'),
    burger: name('.burger-menu'),
    tel: name('a[href^="tel:"]'),
    fb: name('a[href*="facebook"]'),
    close: name('header button:last-of-type'),
    searchSubmit: name('form[role=search] button'),
    qField: name('input[name=q]'),
    email: name('input[name=email]'),
    phone: name('input[name=phone]'),
    figure: q('figure img').getAttribute('alt'),
    filenameImg: q('img[alt="IMG_2041.jpg"]')?.getAttribute('data-dostupno-needs-ai'),
    pixel: q('img[width="1"]').getAttribute('alt'),
    alreadyNamed: name('#named'),
    paleRatio: D.contrastRatio(
      ...[color('.pale'), 'rgb(255,255,255)'].map((c) => { const m = c.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; })
    ),
    darkBoxRatio: D.contrastRatio(
      ...[color('.dark-box p'), 'rgb(28,28,28)'].map((c) => { const m = c.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2] }; })
    ),
    lateButton: name('.close-modal'),
    latePale: color('#later .pale'),
    focusStyle: !!document.getElementById('dostupno-focus'),
    untouched: q('main > p:not([class])').hasAttribute('data-dostupno'),
    changes: D.changes.count(),
  };
});

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
check('figure image uses caption', r.figure === 'Відкриття нового укриття у школі №5', r.figure);
check('filename alt flagged for AI', r.filenameImg === 'alt', r.filenameImg);
check('1px image marked decorative', r.pixel === '', r.pixel);
check('existing name kept', r.alreadyNamed === 'Вже має назву', r.alreadyNamed);
check('pale text now ≥ 4.5:1', r.paleRatio >= 4.5, r.paleRatio.toFixed(2));
check('dark box text now ≥ 4.5:1', r.darkBoxRatio >= 4.5, r.darkBoxRatio.toFixed(2));
check('late-added button named', r.lateButton === 'Закрити', r.lateButton);
check('late-added pale text fixed', r.latePale !== 'rgb(181, 181, 181)', r.latePale);
check('focus style injected', r.focusStyle);
check('fine paragraph untouched', !r.untouched);

// Turning the site off must revert everything.
const after = await page.evaluate(() => {
  window.__setStore({ disabledSites: [location.hostname] });
  return {
    changes: window.Dostupno.changes.count(),
    lang: document.documentElement.getAttribute('lang'),
    marked: document.querySelectorAll('[data-dostupno]').length,
    styles: document.querySelectorAll('[data-dostupno-style]').length,
    pale: getComputedStyle(document.querySelector('.pale')).color,
  };
});
check('revert: change log empty', after.changes === 0, after.changes);
check('revert: lang removed', after.lang === null, after.lang);
check('revert: no marked elements', after.marked === 0, after.marked);
check('revert: styles removed', after.styles === 0, after.styles);
check('revert: original color back', after.pale === 'rgb(181, 181, 181)', after.pale);

console.log(`\n${r.changes} changes applied before revert. ${failed ? failed + ' check(s) failed' : 'All checks passed.'}`);
await browser.close();
process.exit(failed ? 1 : 0);
