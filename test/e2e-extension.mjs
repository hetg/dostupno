/**
 * End-to-end: loads the real unpacked extension in Chromium (not injected
 * scripts), serves the fixture over http, and checks that:
 *  - the manifest loads and the service worker starts
 *  - content scripts run and fix the page (names read from Chromium's accessibility tree)
 *  - turning the site off in storage reverts the page live
 *  - the popup renders without errors and its controls have names
 *  - AI descriptions against a mock backend, on a public-looking host (news.example.ua is
 *    mapped to 127.0.0.1): nothing is sent unless allowed, descriptions apply and revert
 *
 * Run: npm run test:e2e        SHOTS=1 also saves test/e2e-report/popup.png
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startMockBackend, png, ALT, SWAP_ALT } from './mock-backend.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'extension');
const fixture = readFileSync(path.join(root, 'test/fixtures/broken.html'));
const PNG = png();

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  → ' + detail}`);
  if (!ok) failed++;
};

const server = createServer((req, res) => {
  // A page that stays loading for 3 s (blocking script), to check the icon during load.
  if (req.url === '/slow.js') {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end('');
    }, 3000);
    return;
  }
  if (req.url === '/slow.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="uk"><title>Повільна</title><p>Завантаження…</p><script src="/slow.js"></script>');
    return;
  }
  // AI pages: real http images on a public-looking host (see host-resolver-rules below).
  if (req.url.startsWith('/img/')) {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PNG);
    return;
  }
  const page = new URL(req.url, 'http://x');
  if (page.pathname === '/ai.html' || page.pathname === '/ai-login.html') {
    const login = page.pathname === '/ai-login.html';
    const tag = page.searchParams.get('t') || (login ? 'l' : 'n'); // new image URLs per variant
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'/%3E";
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="uk"><title>Новини громади</title>
      <header><img class="avatar" id="avatar" src="/img/avatar-${tag}.png" width="40" height="40">
        <span>Олена Петренко olena.p@gmail.com</span></header>
      <main>
      <article><h2>Свято саджання дерев у школі №5</h2>
        <img id="photo" src="/img/photo-${tag}.png" width="160" height="120"></article>
      <img id="decor" src="/img/decor-${tag}.png" width="160" height="120">
      <img id="slow" src="/img/slow-${tag}.png" width="160" height="120">
      <img id="pixel" src="/img/pixel-${tag}.png" width="1" height="1">
      <div class="card"><img id="ns" src="/img/ns-${tag}.png" width="160" height="120">
        <noscript><img src="https://cdn.example.ua/full.jpg?token=abc123"></noscript><p>Ремонт дороги на вулиці Шевченка</p></div>
      <div class="card"><img id="mail" src="/img/mail-${tag}.png" width="160" height="120"><span>Пишіть нам: olena.p@gmail.com</span></div>
      <img id="lazy" src="${placeholder}" data-src="/img/lazy-${tag}.png" width="160" height="120">
      ${login ? '<form><input name="u" aria-label="Логін"><input type="password" aria-label="Пароль"></form>' : ''}
      <div style="height:5000px"></div>
      <img id="far" src="/img/far-${tag}.png" width="160" height="120">
      </main>
      <script>setTimeout(() => { const l = document.getElementById('lazy'); l.src = l.dataset.src; }, 1200);</script>`);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fixture);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/broken.html`;
const PUBLIC_HOST = 'news.example.ua';
const aiUrl = `http://${PUBLIC_HOST}:${server.address().port}/ai.html`;
const aiLoginUrl = `http://${PUBLIC_HOST}:${server.address().port}/ai-login.html`;
const backend = await startMockBackend();

// Extensions need a persistent context; the "chromium" channel supports them headless.
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--host-resolver-rules=MAP ${PUBLIC_HOST} 127.0.0.1`,
  ],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = worker.url().split('/')[2];
  check('extension loads and its service worker starts', !!extId, worker.url());

  // The privacy gate is loaded in the service worker (importScripts) and fails closed.
  const gate = await worker.evaluate(() => {
    const P = globalThis.Dostupno?.privacy;
    if (typeof P?.mayShareFrom !== 'function') return null;
    return {
      bank: P.mayShareFrom('https://privatbank.ua/', { ai: true, privateSites: [] }),
      publicOptedIn: P.mayShareFrom('https://www.pravda.com.ua/', { ai: true, privateSites: [] }),
      defaults: P.mayShareFrom('https://www.pravda.com.ua/', { ai: false, privateSites: [] }),
    };
  });
  check('privacy gate loads in the service worker', gate !== null);
  check('privacy gate: bank never shares, defaults share nothing',
    gate?.bank === false && gate?.defaults === false && gate?.publicOptedIn === true, JSON.stringify(gate));
  // Read what is really stored (no defaults filled in): nothing may have turned AI on.
  const stored = await worker.evaluate(() => chrome.storage.sync.get(null));
  check('fresh install: AI is not turned on and no sites are excluded',
    stored.ai !== true && (stored.privateSites === undefined || stored.privateSites.length === 0), JSON.stringify(stored));

  // The welcome tab opens on install; it's checked below with the popup.
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(url);
  await page.waitForTimeout(1500);

  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const axName = async (selector) => {
    const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector });
    if (!nodeId) return null;
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return (nodes[0]?.name?.value ?? '').trim();
  };

  check('content scripts fix the page: logo link named', (await axName('#logo-link')) === 'Головна сторінка', await axName('#logo-link'));
  check('content scripts fix the page: burger named', (await axName('.burger-menu')) === 'Меню', await axName('.burger-menu'));
  check('content scripts fix the page: lang set', (await page.getAttribute('html', 'lang')) === 'uk');
  check('the extension causes no page errors', pageErrors.length === 0, pageErrors.join('; '));

  /** Toolbar tooltip for a tab, as screen readers announce it on the toolbar button. */
  const titleOf = async (p) => {
    await p.bringToFront();
    return worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.action.getTitle({ tabId: tab.id });
    });
  };
  const ON = 'Доступно: увімкнено на цьому сайті';
  const OFF = 'Доступно: вимкнено на цьому сайті';
  check('toolbar: tooltip says on', (await titleOf(page)) === ON, await titleOf(page));
  // A second tab of the same site, and a page where Доступно can't run.
  const page2 = await context.newPage();
  await page2.goto(url);
  await page2.waitForTimeout(1000);
  const blank = await context.newPage();
  await blank.goto('about:blank');
  await blank.waitForTimeout(300);
  check('toolbar: a page where Доступно can\'t run keeps the default tooltip', (await titleOf(blank)) === 'Доступно', await titleOf(blank));

  // Turn the site off the way the popup and Alt+Shift+D do: through storage.
  await worker.evaluate((host) => chrome.storage.sync.set({ disabledSites: [host] }), '127.0.0.1');
  await page.waitForTimeout(500);
  check('turning the site off reverts the page live', !(await page.getAttribute('#logo-link', 'aria-label')) && !(await page.getAttribute('html', 'lang')));
  const announced = await page.evaluate(() => document.getElementById('dostupno-live')?.textContent);
  check('turning off is announced to screen readers', announced === 'Доступно вимкнено на цьому сайті', announced);
  check('toolbar: tooltip says off after turning the site off', (await titleOf(page)) === OFF, await titleOf(page));
  check('toolbar: another tab of the same site follows', (await titleOf(page2)) === OFF, await titleOf(page2));
  check('toolbar: unrelated page unaffected', (await titleOf(blank)) === 'Доступно', await titleOf(blank));

  await worker.evaluate(() => chrome.storage.sync.set({ disabledSites: [] }));
  await page.waitForTimeout(500);
  check('turning the site back on fixes the page again', (await page.getAttribute('#logo-link', 'aria-label')) === 'Головна сторінка');
  check('toolbar: tooltip says on again', (await titleOf(page)) === ON && (await titleOf(page2)) === ON, `${await titleOf(page)} / ${await titleOf(page2)}`);

  // Excluding the site from sending (privateSites) is not turning it off: fixes and icon stay on.
  await worker.evaluate((host) => chrome.storage.sync.set({ ai: true, privateSites: [host] }), '127.0.0.1');
  await page.waitForTimeout(500);
  check('excluded from sending only: page stays fixed', (await page.getAttribute('#logo-link', 'aria-label')) === 'Головна сторінка');
  check('excluded from sending only: tooltip still says on', (await titleOf(page)) === ON, await titleOf(page));
  await worker.evaluate(() => chrome.storage.sync.remove(['ai', 'privateSites']));
  await page.waitForTimeout(300);

  // Navigating an "off" tab to a page where Доступно can't run resets the icon.
  await worker.evaluate((host) => chrome.storage.sync.set({ disabledSites: [host] }), '127.0.0.1');
  await page2.waitForTimeout(500);
  await page2.goto('about:blank');
  await page2.waitForTimeout(500);
  check('toolbar: navigating away from an off site resets the tooltip', (await titleOf(page2)) === 'Доступно', await titleOf(page2));
  // While a page of an off site is still loading, the icon already says off.
  await page2.goto(url.replace('/broken.html', '/slow.html'), { waitUntil: 'commit' });
  await page2.waitForTimeout(800);
  const loading = await page2.evaluate(() => document.readyState);
  check('toolbar: shows off while an off site is still loading', loading === 'loading' && (await titleOf(page2)) === OFF, `${loading}: ${await titleOf(page2)}`);
  await page2.waitForLoadState('load');
  // Same server under another hostname = a different site, where Доступно is on.
  await page2.goto(url.replace('127.0.0.1', 'localhost'));
  await page2.waitForTimeout(1000);
  check('toolbar: navigating to a site where Доступно is on shows on', (await titleOf(page2)) === ON, await titleOf(page2));
  await worker.evaluate(() => chrome.storage.sync.set({ disabledSites: [] }));
  await page.waitForTimeout(500);
  await page2.close();
  await blank.close();

  // The screen reader profile controls the label fixers; the page language stays.
  await worker.evaluate(() => chrome.storage.sync.set({ profiles: { screenreader: false, lowvision: false } }));
  await page.waitForTimeout(500);
  const logoOff = await axName('#logo-link');
  check('screen reader profile off: logo link loses its name', logoOff === '', logoOff);
  check('screen reader profile off: page language stays', (await page.getAttribute('html', 'lang')) === 'uk');
  await worker.evaluate(() => chrome.storage.sync.set({ profiles: { screenreader: true, lowvision: false } }));
  await page.waitForTimeout(500);
  check('screen reader profile back on: logo link named again', (await axName('#logo-link')) === 'Головна сторінка', await axName('#logo-link'));

  // ---------------------------------------------------------------------------
  // AI descriptions (mock backend). The unpacked extension is a "development" install,
  // so storage.local.devBackendUrl points it at the mock.
  // ---------------------------------------------------------------------------
  const setSync = (v) => worker.evaluate((x) => chrome.storage.sync.set(x), v);
  const imgState = (p) => p.evaluate(() => Object.fromEntries(['photo', 'decor', 'slow'].map((id) => {
    const el = document.getElementById(id);
    return [id, { alt: el.getAttribute('alt'), flag: el.getAttribute('data-dostupno-needs-ai') }];
  })));
  const waitFor = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  const availableBefore = await worker.evaluate(async () => {
    const self = await chrome.management.getSelf();
    return self.installType;
  });
  check('unpacked extension is a development install (dev backend override allowed)', availableBefore === 'development', availableBefore);
  await worker.evaluate((u) => chrome.storage.local.set({ devBackendUrl: u }), backend.url);

  const ai = await context.newPage();
  const aiErrors = [];
  ai.on('pageerror', (e) => aiErrors.push(String(e)));
  await ai.goto(aiUrl);
  await ai.waitForTimeout(1500);
  let s = await imgState(ai);
  check('AI off (default): nothing is sent', backend.requests.length === 0, JSON.stringify(backend.requests));
  check('AI off: content images are flagged and have no alt', s.photo.flag === 'alt' && s.photo.alt === null, JSON.stringify(s));

  // Opt in: the page re-applies and the images near the viewport get described.
  await setSync({ ai: true });
  check('AI on: a request reaches the backend', await waitFor(() => backend.requests.length > 0), 'no request');
  // While the batch (it includes the slow image) is in flight, the site describes one image itself.
  await ai.evaluate(() => document.getElementById('slow').setAttribute('alt', 'Мер міста на відкритті'));
  check('AI on: photo described with the ШІ prefix',
    await waitFor(async () => (await imgState(ai)).photo.alt === `ШІ: ${ALT}`), JSON.stringify(await imgState(ai)));
  s = await imgState(ai);
  check('AI on: described photo loses its flag', s.photo.flag === null, JSON.stringify(s));
  check('AI on: decorative verdict gives alt=""', s.decor.alt === '' && s.decor.flag === null, JSON.stringify(s));
  check('AI on: a site alt added while the request was in flight is kept', s.slow.alt === 'Мер міста на відкритті', JSON.stringify(s));
  const req = backend.requests[0];
  const keysOk = req && Object.keys(req).sort().join() === 'items,lang,pageHost' &&
    req.items.every((i) => Object.keys(i).sort().join() === 'context,imageUrl' && i.context.length <= 300);
  check('request carries only pageHost, lang and items {imageUrl, context ≤ 300}', keysOk, JSON.stringify(req));
  check('request names the page only by host', req?.pageHost === PUBLIC_HOST && !JSON.stringify(req).includes('/ai.html'), JSON.stringify(req));
  check('request context comes from nearby text', req?.items.some((i) => i.context.includes('Свято саджання дерев')), JSON.stringify(req?.items));
  const sentUrls = () => backend.requests.flatMap((r) => r.items.map((i) => i.imageUrl));
  const itemFor = (part) => backend.requests.flatMap((r) => r.items).find((i) => i.imageUrl.includes(part));
  check('context never includes <noscript> markup or refused URLs',
    itemFor('/img/ns-n')?.context.includes('Ремонт дороги') && !/<img|token|cdn\.example/.test(itemFor('/img/ns-n')?.context), JSON.stringify(itemFor('/img/ns-n')));
  check('context never includes e-mail addresses', itemFor('/img/mail-n') && !itemFor('/img/mail-n').context.includes('@'), JSON.stringify(itemFor('/img/mail-n')));
  check('header / avatar images are never sent', !sentUrls().some((u) => u.includes('/img/avatar')), JSON.stringify(sentUrls()));
  check('images far below the fold are not requested yet', !sentUrls().some((u) => u.includes('/img/far-n')), JSON.stringify(sentUrls()));
  check('lazy image is described once its real picture loads',
    await waitFor(async () => (await ai.getAttribute('#lazy', 'alt')) === `ШІ: ${ALT}`), await ai.getAttribute('#lazy', 'alt'));
  await ai.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  check('far image requested once scrolled near', await waitFor(async () => sentUrls().some((u) => u.includes('/img/far-n'))), JSON.stringify(sentUrls()));
  await ai.evaluate(() => window.scrollTo(0, 0));
  // A gallery swaps the picture in the same <img>: the old description must not stay.
  await ai.evaluate(() => { document.getElementById('photo').src = '/img/swap-n.png'; });
  check('image swapped by the site: old description withdrawn, new picture described',
    await waitFor(async () => (await ai.getAttribute('#photo', 'alt')) === `ШІ: ${SWAP_ALT}`), await ai.getAttribute('#photo', 'alt'));
  await ai.evaluate(() => { document.getElementById('photo').src = '/img/photo-n.png'; });
  await waitFor(async () => (await ai.getAttribute('#photo', 'alt')) === `ШІ: ${ALT}`);
  check('a 1×1 tracking pixel is never sent', !backend.requests.some((r) => r.items.some((i) => i.imageUrl.includes('/img/pixel'))),
    JSON.stringify(backend.requests.map((r) => r.items.map((i) => i.imageUrl))));
  check('AI page has no errors', aiErrors.length === 0, aiErrors.join('; '));

  // Answers that arrive after AI descriptions or Доступно were turned off change nothing.
  // (Turning AI off re-applies the page, so the images are flagged again: only the
  // generation check keeps a late answer out. Turning the site off removes the flags too.)
  const noAiAlts = (p) => p.evaluate(() => ![...document.images].some((i) => (i.getAttribute('alt') || '').startsWith('ШІ:')));
  for (const [variant, off, on] of [
    ['late-ai', { ai: false }, { ai: true }],
    ['late-site', { disabledSites: [PUBLIC_HOST] }, { disabledSites: [] }],
  ]) {
    const late = await context.newPage();
    await late.goto(`${aiUrl}?t=${variant}`);
    check(`${variant}: request in flight`, await waitFor(() => sentUrls().some((u) => u.includes(`/img/slow-${variant}`))), JSON.stringify(sentUrls()));
    await setSync(off);
    await late.waitForTimeout(2500);
    check(`${variant}: late answer after turning off changes nothing`, await noAiAlts(late));
    await setSync(on);
    await late.close();
  }

  // Backend unreachable: images stay as they were, the page keeps working.
  await worker.evaluate(() => chrome.storage.local.set({ devBackendUrl: 'http://127.0.0.1:9' }));
  const down = await context.newPage();
  const downErrors = [];
  down.on('pageerror', (e) => downErrors.push(String(e)));
  await down.goto(`${aiUrl}?t=down`);
  await down.waitForTimeout(3000);
  s = await imgState(down);
  check('backend unreachable: images stay flagged, no alt, no page errors',
    s.photo.flag === 'alt' && s.photo.alt === null && downErrors.length === 0, JSON.stringify({ s, downErrors }));
  await down.close();
  await worker.evaluate((u) => chrome.storage.local.set({ devBackendUrl: u }), backend.url);

  // Screen reader profile off: AI descriptions are part of it, so nothing is sent.
  await setSync({ profiles: { screenreader: false, lowvision: false } });
  const sentBeforeSr = backend.requests.length;
  const noSr = await context.newPage();
  await noSr.goto(`${aiUrl}?t=sr`);
  await noSr.waitForTimeout(2000);
  check('screen reader profile off: nothing is sent', backend.requests.length === sentBeforeSr, JSON.stringify(backend.requests.slice(sentBeforeSr)));
  await noSr.close();
  await setSync({ profiles: { screenreader: true, lowvision: false } });

  // A page that shows a password field never sends.
  const sentBeforeLogin = backend.requests.length;
  const login = await context.newPage();
  await login.goto(aiLoginUrl);
  await login.waitForTimeout(2000);
  s = await imgState(login);
  check('password field on the page: nothing is sent', backend.requests.length === sentBeforeLogin, JSON.stringify(backend.requests.slice(sentBeforeLogin)));
  check('password field on the page: images stay flagged', s.photo.flag === 'alt' && s.photo.alt === null, JSON.stringify(s));
  await login.close();

  // Excluding the site: the page re-applies, AI descriptions go, nothing more is sent.
  const sentBeforeExclude = backend.requests.length;
  await setSync({ privateSites: [PUBLIC_HOST] });
  check('site excluded: AI descriptions removed, flags back',
    await waitFor(async () => { const x = await imgState(ai); return x.photo.alt === null && x.photo.flag === 'alt'; }), JSON.stringify(await imgState(ai)));
  await ai.reload();
  await ai.waitForTimeout(1500);
  check('site excluded: nothing is sent', backend.requests.length === sentBeforeExclude, JSON.stringify(backend.requests.slice(sentBeforeExclude)));
  check('site excluded: images stay flagged', (await imgState(ai)).photo.flag === 'alt');

  // Back on, then AI off: descriptions come back, then disappear without a reload.
  await setSync({ privateSites: [] });
  check('exclusion removed: photo described again',
    await waitFor(async () => (await imgState(ai)).photo.alt === `ШІ: ${ALT}`), JSON.stringify(await imgState(ai)));
  await setSync({ ai: false });
  check('AI off again: descriptions gone and flags back',
    await waitFor(async () => { const x = await imgState(ai); return x.photo.alt === null && x.photo.flag === 'alt' && x.decor.alt === null; }),
    JSON.stringify(await imgState(ai)));

  // Popup with a backend configured: the AI group is there, named and described.
  const aiPopup = await context.newPage();
  await aiPopup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await aiPopup.waitForTimeout(400);
  const aiSnap = await aiPopup.locator('main').ariaSnapshot();
  check('popup (backend configured): "Описи зображень" group with the opt-in checkbox',
    aiSnap.includes('group "Описи зображень"') && aiSnap.includes('checkbox "Описувати зображення за допомогою ШІ"'), aiSnap);
  check('popup: opt-in is unchecked while AI is off', !(await aiPopup.isChecked('#ai-toggle')));
  const description = await aiPopup.evaluate(() => {
    const el = document.getElementById('ai-toggle');
    return document.getElementById(el.getAttribute('aria-describedby'))?.textContent.trim();
  });
  check('popup: opt-in describes what is sent', description?.startsWith('Надсилає на сервер Доступно адресу зображення'), description);
  await aiPopup.check('#ai-toggle');
  check('popup: ticking the opt-in saves ai: true',
    await waitFor(async () => (await worker.evaluate(() => chrome.storage.sync.get({ ai: false }))).ai === true), 'not saved');
  // Per-site control. A real popup belongs to the active tab; opened as a page here it *is* the
  // active tab, so make its "current tab" lookup return the AI page, as when opened over it.
  await aiPopup.close();
  const aiTab = await worker.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u), aiUrl);
  const sitePopup = await context.newPage();
  await sitePopup.addInitScript(({ id, url: tabUrl }) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (q) => (q?.active ? Promise.resolve([{ id, url: tabUrl }]) : query(q));
  }, { id: aiTab?.id, url: aiUrl });
  await sitePopup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await sitePopup.waitForTimeout(400);
  const aiPopupSite = sitePopup;
  const siteSnap = await aiPopupSite.locator('main').ariaSnapshot();
  check('popup: per-site checkbox "Не надсилати нічого з цього сайту" for a public site',
    siteSnap.includes('checkbox "Не надсилати нічого з цього сайту"'), siteSnap);
  // Keyboard: Tab reaches both new checkboxes, each with a visible focus indicator.
  const tabbed = [];
  for (let i = 0; i < 8; i++) {
    await aiPopupSite.keyboard.press('Tab');
    tabbed.push(await aiPopupSite.evaluate(() => {
      const el = document.activeElement;
      const ring = getComputedStyle(el.closest('.choice') || el);
      return { id: el.id, ring: ring.outlineStyle !== 'none' || ring.boxShadow !== 'none' };
    }));
  }
  const reached = (id) => tabbed.find((t) => t.id === id);
  check('popup keyboard: Tab reaches the AI opt-in and the per-site checkbox with a visible focus ring',
    reached('ai-toggle')?.ring && reached('ai-site-toggle')?.ring, JSON.stringify(tabbed));
  await aiPopupSite.focus('#ai-site-toggle');
  await aiPopupSite.keyboard.press('Space');
  check('popup keyboard: Space toggles the per-site checkbox', await aiPopupSite.isChecked('#ai-site-toggle'));
  await aiPopupSite.keyboard.press('Space');
  // 200% zoom in the largest popup Chrome allows (800 px): no horizontal scrolling.
  await aiPopupSite.setViewportSize({ width: 800, height: 600 });
  const zoomOk = await aiPopupSite.evaluate(() => {
    document.documentElement.style.zoom = '2';
    const ok = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
    document.documentElement.style.zoom = '';
    return ok;
  });
  check('popup at 200% zoom: no horizontal scroll with the AI controls shown', zoomOk);
  // High contrast (forced colors): the choices keep their borders and the checkboxes stay visible.
  await aiPopupSite.emulateMedia({ forcedColors: 'active' });
  const forced = await aiPopupSite.evaluate(() => ['ai-toggle', 'ai-site-toggle'].every((id) => {
    const input = document.getElementById(id);
    const box = input.getBoundingClientRect();
    return getComputedStyle(input.closest('.choice')).borderStyle !== 'none' && box.width > 10 && box.height > 10;
  }));
  check('popup in forced colors: AI choices keep borders and visible checkboxes', forced);
  await aiPopupSite.emulateMedia({ forcedColors: 'none' });
  await aiPopupSite.check('#ai-site-toggle');
  check('popup: ticking it adds the host to privateSites',
    await waitFor(async () => (await worker.evaluate(() => chrome.storage.sync.get({ privateSites: [] }))).privateSites.includes(PUBLIC_HOST)), 'not saved');
  await aiPopupSite.uncheck('#ai-site-toggle');
  check('popup: unticking removes it',
    await waitFor(async () => !(await worker.evaluate(() => chrome.storage.sync.get({ privateSites: [] }))).privateSites.includes(PUBLIC_HOST)), 'not removed');
  await aiPopupSite.close();

  // On a private site the popup explains instead of offering the checkbox.
  const bankPopup = await context.newPage();
  await bankPopup.addInitScript(() => {
    chrome.tabs.query = () => Promise.resolve([{ id: -1, url: 'https://next.privatbank.ua/cards' }]);
  });
  await bankPopup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await bankPopup.waitForTimeout(400);
  const bankText = await bankPopup.locator('#ai-section').innerText();
  check('popup on a bank site: private-site note, no checkbox',
    bankText.includes('З цього сайту нічого не надсилається: він приватний.') && await bankPopup.locator('#ai-site-toggle').isHidden(), bankText);
  await bankPopup.close();
  await setSync({ ai: false, privateSites: [] });

  // Welcome page: the opt-in comes after the profile choices, unchecked.
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${extId}/popup/popup.html?welcome=1`);
  await welcome.waitForTimeout(400);
  const welcomeOrder = await welcome.evaluate(() => {
    const profiles = document.getElementById('profiles');
    const aiBox = document.getElementById('ai-section');
    return !aiBox.hidden && !!(profiles.compareDocumentPosition(aiBox) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !document.getElementById('ai-toggle').checked && document.getElementById('ai-site').hidden;
  });
  check('welcome page: unchecked AI opt-in after the profile choices, no per-site control', welcomeOrder);
  await welcome.close();

  // No backend address (as in release builds until change 3): no AI controls at all.
  await worker.evaluate(() => chrome.storage.local.remove('devBackendUrl'));
  const plainPopup = await context.newPage();
  await plainPopup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await plainPopup.waitForTimeout(400);
  check('popup without a backend: no AI group', await plainPopup.locator('#ai-section').isHidden());
  check('popup without a backend: no mention of AI', !(await plainPopup.locator('main').innerText()).includes('ШІ'));
  await plainPopup.close();
  await ai.close();

  // Popup (opened as a page: there is no "current site", so the site section hides).
  const popup = await context.newPage();
  const popupErrors = [];
  popup.on('pageerror', (e) => popupErrors.push(String(e)));
  popup.on('console', (m) => m.type() === 'error' && popupErrors.push(m.text()));
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForTimeout(300);
  check('popup renders without errors', popupErrors.length === 0, popupErrors.join('; '));
  check('popup is in Ukrainian', (await popup.getAttribute('html', 'lang')) === 'uk');
  const snapshot = await popup.locator('main').ariaSnapshot();
  check('popup profile choices are named for screen readers',
    snapshot.includes('checkbox "Я користуюсь скрінрідером') && snapshot.includes('checkbox "Я погано бачу'), snapshot);

  if (process.env.SHOTS) {
    mkdirSync(path.join(root, 'test/e2e-report'), { recursive: true });
    await popup.setViewportSize({ width: 380, height: 460 });
    await popup.screenshot({ path: path.join(root, 'test/e2e-report/popup.png') });
    console.log('saved test/e2e-report/popup.png');
  }
} finally {
  await context.close();
  server.close();
  await backend.close();
}

console.log(`\n${failed ? failed + ' check(s) failed' : 'All checks passed.'}`);
process.exit(failed ? 1 : 0);
