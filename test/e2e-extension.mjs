/**
 * End-to-end: loads the real unpacked extension in Chromium (not injected
 * scripts), serves the fixture over http, and checks that:
 *  - the manifest loads and the service worker starts
 *  - content scripts run and fix the page (names read from Chromium's accessibility tree)
 *  - turning the site off in storage reverts the page live
 *  - the popup renders without errors and its controls have names
 *
 * Run: npm run test:e2e        SHOTS=1 also saves test/e2e-report/popup.png
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'extension');
const fixture = readFileSync(path.join(root, 'test/fixtures/broken.html'));

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  → ' + detail}`);
  if (!ok) failed++;
};

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(fixture);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/broken.html`;

// Extensions need a persistent context; the "chromium" channel supports them headless.
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = worker.url().split('/')[2];
  check('extension loads and its service worker starts', !!extId, worker.url());

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

  // Navigating an "off" tab to a page where Доступно can't run resets the icon.
  await worker.evaluate((host) => chrome.storage.sync.set({ disabledSites: [host] }), '127.0.0.1');
  await page2.waitForTimeout(500);
  await page2.goto('about:blank');
  await page2.waitForTimeout(500);
  check('toolbar: navigating away from an off site resets the tooltip', (await titleOf(page2)) === 'Доступно', await titleOf(page2));
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
}

console.log(`\n${failed ? failed + ' check(s) failed' : 'All checks passed.'}`);
process.exit(failed ? 1 : 0);
