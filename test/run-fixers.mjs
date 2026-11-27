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
  window.__store = Object.assign(
    { enabled: true, profiles: { screenreader: true, lowvision: true }, disabledSites: [] },
    window.__initialStore || {}
  );
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

/** Accessible names as computed by Chromium for a page (null if the element doesn't exist). */
const axTools = async (p) => {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
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
  return { axName, axNames };
};
const { axNames } = await axTools(page);

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

// Animated placeholder (comfy.ua): once the site changes it, it no longer counts as a label.
const typed = () =>
  page.evaluate(() => {
    const field = (sel) => {
      const el = document.querySelector(sel);
      return { label: el.getAttribute('aria-label'), ai: el.getAttribute('data-dostupno-needs-ai'), marked: el.hasAttribute('data-dostupno') };
    };
    return { steps: window.__typedSteps, search: field('#typed-search'), unknown: field('#typed-unknown'), labelled: field('#typed-labelled') };
  });
const t1 = await typed();
await page.waitForTimeout(300); // a few more animation steps
const t2 = await typed();
check('animated placeholder: labeled from the name hint, not an example word', t1.search.label === 'Пошук' && t2.search.label === 'Пошук', JSON.stringify([t1.search, t2.search]));
check('animated placeholder, no other source: no label, marked for AI', t2.unknown.label === null && t2.unknown.ai === 'label', JSON.stringify(t2.unknown));
check('animated placeholder on a site-labelled field: untouched', t2.labelled.label === 'Пошук товарів' && !t2.labelled.marked && t2.labelled.ai === null, JSON.stringify(t2.labelled));
check('animated placeholder keeps animating', t2.steps > t1.steps, `${t1.steps} → ${t2.steps}`);

// A placeholder cleared on focus and put back on blur is not an animation.
const focusLabel = async () => page.evaluate(() => {
  const el = document.querySelector('#focus-clear');
  return { label: el.getAttribute('aria-label'), ai: el.getAttribute('data-dostupno-needs-ai'), ph: el.getAttribute('placeholder') };
});
await page.focus('#focus-clear');
await page.waitForTimeout(50);
const onFocus = await focusLabel();
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(50);
const onBlur = await focusLabel();
check('placeholder cleared on focus: label kept while focused', onFocus.ph === '' && onFocus.label === 'Пошук по сайту' && onFocus.ai === null, JSON.stringify(onFocus));
check('placeholder put back on blur: label kept', onBlur.label === 'Пошук по сайту' && onBlur.ai === null, JSON.stringify(onBlur));

// Name/id hints: only where they fit the field.
const hint = await page.evaluate(() => Object.fromEntries(['plain-q', 'qty', 'name-field'].map((id) => {
  const el = document.getElementById(id);
  return [id, { label: el.getAttribute('aria-label'), ai: el.getAttribute('data-dostupno-needs-ai') }];
})));
check('text field named q labeled from the hint', hint['plain-q'].label === 'Пошук', JSON.stringify(hint['plain-q']));
check('number field named q not labeled as search', hint.qty.label === null && hint.qty.ai === 'label', JSON.stringify(hint.qty));
check('field named "name" not labeled as first name', hint['name-field'].label === null && hint['name-field'].ai === 'label', JSON.stringify(hint['name-field']));

// The site names a field itself after we labeled it from its placeholder: leave it to the site.
await page.evaluate(() => {
  const div = document.createElement('div');
  div.id = 'late-field';
  div.innerHTML = '<input type="text" name="zz" id="late-input" placeholder="Знайти книгу">';
  document.body.append(div);
});
await page.waitForTimeout(600); // the content script handles new subtrees after 300 ms
const lateFirst = await page.evaluate(() => document.getElementById('late-input').getAttribute('aria-label'));
await page.evaluate(() => {
  const label = document.createElement('label');
  label.htmlFor = 'late-input';
  label.textContent = 'Назва книги';
  document.getElementById('late-field').prepend(label);
  document.getElementById('late-input').setAttribute('placeholder', 'Кобзар');
});
await page.waitForTimeout(50);
const lateAfter = await page.evaluate(() => {
  const el = document.getElementById('late-input');
  return { label: el.getAttribute('aria-label'), ai: el.getAttribute('data-dostupno-needs-ai') };
});
check('late field labeled from its placeholder first', lateFirst === 'Знайти книгу', lateFirst);
check('placeholder changed after the site added a <label>: our label removed, no AI marker', lateAfter.label === null && lateAfter.ai === null, JSON.stringify(lateAfter));

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
    // Attributes besides the site's own type/name/id/placeholder, per animated field.
    typed: [...document.querySelectorAll('#typed input')].map((el) =>
      [...el.attributes].filter((a) => !['type', 'name', 'id', 'placeholder'].includes(a.name)).map((a) => `${a.name}=${a.value}`).join(' ')
    ),
  };
});
check('revert: change log empty', after.changes === 0, after.changes);
check('revert: lang removed', after.lang === null, after.lang);
check('revert: no marked elements', after.marked === 0, after.marked);
check('revert: styles removed', after.styles === 0, after.styles);
check('revert: original color back', after.pale === 'rgb(181, 181, 181)', after.pale);
check('revert: button background back', after.greenBg === 'rgb(0, 160, 70)', after.greenBg);
check('revert: AI markers removed', after.needsAi === 0, after.needsAi);
check('revert: animated-placeholder fields back to their own attributes', JSON.stringify(after.typed) === JSON.stringify(['', '', 'aria-label=Пошук товарів']), JSON.stringify(after.typed));

// A contrast check scheduled before turning off must not touch the reverted page.
await page.evaluate(() => document.getElementById('far').scrollIntoView());
await page.waitForTimeout(500);
const late = await page.evaluate(() => ({
  steps: window.__typedSteps,
  changes: window.Dostupno.changes.count(),
  far: getComputedStyle(document.getElementById('far')).color,
}));
check('after revert: no new changes', late.changes === 0 && late.far === 'rgb(181, 181, 181)', JSON.stringify(late));
check('after revert: placeholder still animates, nothing relabeled', late.steps > t2.steps && late.changes === 0, JSON.stringify(late));

console.log(`\n${r.changes} changes applied before revert.\n`);
// --- Screen reader profile off: only the page-language fix may touch the page. ---
/** Open the fixture with the given settings and let the fixers run. */
const openFixture = async (initialStore) => {
  const p = await browser.newPage();
  await p.goto(fixture);
  await p.evaluate((store) => (window.__initialStore = store), initialStore);
  await p.addScriptTag({ content: chromeShim });
  for (const s of scripts) await p.addScriptTag({ content: s });
  await p.waitForTimeout(1500); // includes the late-added content
  return p;
};
/** What Доступно left on the page: elements it marked, AI markers, lang. */
const footprint = (p) =>
  p.evaluate(() => ({
    marked: [...document.querySelectorAll('[data-dostupno]')].map((el) => el.tagName.toLowerCase()),
    needsAi: document.querySelectorAll('[data-dostupno-needs-ai]').length,
    lang: document.documentElement.getAttribute('lang'),
  }));
const namedByUs = (names) =>
  Object.entries(names).filter(([k, v]) => meaningful(k, v) && !NAMED_BY_SITE.has(k) && k !== 'figureImg');

const off = await openFixture({ profiles: { screenreader: false, lowvision: false } });
const offPrint = await footprint(off);
check('screen reader profile off: only <html lang> is changed', offPrint.marked.join() === 'html', offPrint.marked.join());
check('screen reader profile off: no AI markers', offPrint.needsAi === 0, offPrint.needsAi);
check('screen reader profile off: page language still set', offPrint.lang === 'uk', offPrint.lang);
const offNamed = namedByUs(await (await axTools(off)).axNames());
check('screen reader profile off: controls get no names from Доступно', offNamed.length === 0, JSON.stringify(offNamed));
await off.close();

// --- Switching the screen reader profile off and on with the page open. ---
const live = await openFixture({});
const liveAx = await axTools(live);
await live.evaluate(() => window.__setStore({ profiles: { screenreader: false, lowvision: false } }));
await live.waitForTimeout(300);
const liveOff = await footprint(live);
const liveOffNamed = namedByUs(await liveAx.axNames());
check('turning the profile off removes names live', liveOffNamed.length === 0, JSON.stringify(liveOffNamed));
check('turning the profile off removes AI markers live', liveOff.needsAi === 0, liveOff.needsAi);
check('turning the profile off keeps the page language', liveOff.lang === 'uk', liveOff.lang);
check('turning the profile off leaves only <html lang> changed', liveOff.marked.join() === 'html', liveOff.marked.join());
await live.evaluate(() => window.__setStore({ profiles: { screenreader: true, lowvision: false } }));
await live.waitForTimeout(300);
const liveOn = await liveAx.axNames();
check('turning the profile back on restores names live', liveOn.logo === 'Головна сторінка' && liveOn.burger === 'Меню', JSON.stringify({ logo: liveOn.logo, burger: liveOn.burger }));
check('turning the profile back on restores form labels live', liveOn.email === 'Електронна пошта', liveOn.email);
const liveTyped = await live.evaluate(() => document.querySelector('#typed-search').getAttribute('aria-label'));
check('turning the profile back on: animated placeholder field labeled from its hint again', liveTyped === 'Пошук', liveTyped);
const figureAlt = await live.evaluate(() => document.querySelector('figure img').getAttribute('alt'));
check('turning the profile back on restores alt text live', figureAlt === 'Відкриття нового укриття у школі №5', figureAlt);
await live.close();

// --- Change log: removeAttr is undone like setAttr, newest first. ---
const unit = await openFixture({ enabled: false });
const log = await unit.evaluate(() => {
  const C = window.Dostupno.changes;
  const had = document.createElement('div');
  had.setAttribute('title', 'site');
  const none = document.createElement('div');
  document.body.append(had, none);
  C.setAttr(had, 'title', 'a');
  C.removeAttr(had, 'title');
  C.setAttr(none, 'aria-label', 'блен');
  C.setAttr(none, 'aria-label', 'Пошук');
  C.removeAttr(none, 'aria-label');
  C.removeAttr(none, 'aria-label'); // already absent: nothing to record
  const mid = { had: had.hasAttribute('title'), none: none.hasAttribute('aria-label'), count: C.count() };
  C.revertAll();
  return {
    mid,
    title: had.getAttribute('title'),
    label: none.getAttribute('aria-label'),
    marked: had.hasAttribute('data-dostupno') || none.hasAttribute('data-dostupno'),
    count: C.count(),
  };
});
check('removeAttr removes and records once', !log.mid.had && !log.mid.none && log.mid.count === 5, JSON.stringify(log.mid));
check('revert after removeAttr restores the site value', log.title === 'site', log.title);
check('revert after removeAttr leaves an added attribute absent', log.label === null && !log.marked && log.count === 0, JSON.stringify(log));
await unit.close();

console.log(`\n${failed ? failed + ' check(s) failed' : 'All checks passed.'}`);
await browser.close();
process.exit(failed ? 1 : 0);
