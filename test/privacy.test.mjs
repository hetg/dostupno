/**
 * Privacy gate (extension/src/privacy.js): what may be sent off the device.
 * Host and URL rules run in node; pageLooksPrivate runs in Chromium.
 *
 * Run: npm run test:privacy
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'extension/src/privacy.js'), 'utf8');

const ctx = vm.createContext({ URL, URLSearchParams });
ctx.globalThis = ctx;
vm.runInContext(source, ctx);
const P = ctx.Dostupno.privacy;

const ON = { ai: true, privateSites: [] };

test('nothing is shared unless the user opted in', () => {
  const page = 'https://www.pravda.com.ua/news/';
  assert.equal(P.mayShareFrom(page, { privateSites: [] }), false, 'ai missing');
  assert.equal(P.mayShareFrom(page, { ai: false, privateSites: [] }), false, 'ai false');
  assert.equal(P.mayShareFrom(page, { ai: 'true', privateSites: [] }), false, 'ai must be exactly true');
  assert.equal(P.mayShareFrom(page, undefined), false, 'no settings');
  assert.equal(P.mayShareFrom(page, ON), true, 'opted in, public page');
});

test('built-in private sites never share, subdomains included', () => {
  for (const url of [
    'https://next.privatbank.ua/cards',
    'https://privatbank.ua/',
    'https://diia.gov.ua/',
    'https://plan.diia.gov.ua/x',
    'https://mail.google.com/mail/u/0/',
    'https://helsi.me/',
    'https://PrivatBank.UA./', // case and trailing dot
    'https://photos.google.com/photo/AF1Qip', // private photos: their image URLs carry no token
    'https://myaccount.google.com/',
    'https://acme.sharepoint.com/sites/hr',
  ]) {
    assert.equal(P.mayShareFrom(url, ON), false, url);
  }
});

test('look-alike domains are not matched by suffix text', () => {
  assert.equal(P.isPrivateHost('notprivatbank.ua'), false);
  assert.equal(P.isPrivateHost('privatbank.ua.example.com'), false);
  // isPrivateHost accepts what callers are likely to have: a URL or host:port.
  assert.equal(P.isPrivateHost('https://privatbank.ua/'), true);
  assert.equal(P.isPrivateHost('privatbank.ua:8443'), true);
  assert.equal(P.mayShareFrom('https://notprivatbank.ua/', ON), true);
  // Public pages of google.com and gov.ua stay shareable: only the private hosts are listed.
  assert.equal(P.mayShareFrom('https://www.google.com/search?q=x', ON), true);
  assert.equal(P.mayShareFrom('https://kmu.gov.ua/news', ON), true);
});

test('non-public pages never share', () => {
  for (const url of [
    'http://wiki.corp/',
    'http://192.168.1.10/',
    'http://127.0.0.1:8080/',
    'http://[::1]/',
    'http://localhost:3000/',
    'http://app.localhost/',
    'http://intranet/',
    'http://printer.local/',
    'http://nas.home.arpa/',
    'http://router.home/',
    'http://srv.localdomain/',
    'http://site.test/',
    'http://abcdefghijklmnop.onion/', // Tor Browser can run Firefox extensions
    'http://site.i2p/',
    'http://router.alt/',
    'http://127.0.0.1.nip.io/', // public DNS names that point at a local address
    'http://app.localtest.me/',
    'http://localtest.me/',
    'http://wiki.corp.../', // any number of trailing dots
    'https://privatbank.ua.../',
    'file:///Users/me/report.html',
    'chrome://settings/',
    'about:blank',
    'not a url',
  ]) {
    assert.equal(P.mayShareFrom(url, ON), false, url);
  }
});

test('user-excluded sites never share, subdomains included', () => {
  const settings = { ai: true, privateSites: ['example.ua'] };
  assert.equal(P.mayShareFrom('https://shop.example.ua/', settings), false);
  assert.equal(P.mayShareFrom('https://example.ua/', settings), false);
  assert.equal(P.mayShareFrom('https://notexample.ua/', settings), true);
  // Entries are normalized the way the browser normalizes hosts.
  for (const entry of ['https://example.ua/', ' example.ua', '*.example.ua', 'EXAMPLE.UA', 'example.ua:8443',
    '.example.ua', 'https://*.example.ua', '*.*.example.ua']) {
    assert.equal(P.mayShareFrom('https://shop.example.ua/', { ai: true, privateSites: [entry] }), false, entry);
  }
  assert.equal(P.mayShareFrom('https://xn--80aikifvh.xn--j1amh/', { ai: true, privateSites: ['приклад.укр'] }), false,
    'unicode entry matches the punycode page host');
  // Malformed settings fail closed instead of being ignored.
  for (const privateSites of ['example.ua', { 0: 'example.ua', length: 1 }, null, [''], [42], ['http://'],
    ['*example.ua'], ['exa*mple.ua'], ['example..ua']]) {
    assert.equal(P.mayShareFrom('https://news.site.ua/', { ai: true, privateSites }), false, JSON.stringify(privateSites));
  }
  assert.equal(P.mayShareFrom('https://news.site.ua/', { ai: true }), true, 'missing privateSites is the default []');
});

test('sites where Доступно is off never share', () => {
  const page = 'https://news.site.ua/';
  assert.equal(P.mayShareFrom(page, { ai: true, enabled: false }), false, 'turned off everywhere');
  assert.equal(P.mayShareFrom(page, { ai: true, disabledSites: ['news.site.ua'] }), false, 'turned off on the site');
  assert.equal(P.mayShareFrom(page, { ai: true, disabledSites: ['site.ua'] }), false, 'subdomain of a turned-off site');
  assert.equal(P.mayShareFrom(page, { ai: true, disabledSites: 'news.site.ua' }), false, 'malformed disabledSites');
  assert.equal(P.mayShareFrom(page, { ai: true, enabled: true, disabledSites: ['other.ua'] }), true);
});

test('private sections of public sites never share', () => {
  for (const url of [
    'https://www.facebook.com/messages/t/1',
    'https://www.facebook.com/messages',
    'https://www.instagram.com/direct/inbox/',
    'https://x.com/messages/123',
    'https://x.com/i/chat/1',
    'https://twitter.com/messages',
    'https://www.linkedin.com/messaging/thread/1/',
    'https://www.linkedin.com//Messaging/', // case and doubled slashes
    'https://www.facebook.com/%6Dessages/t/1', // percent-encoded
    'https://www.facebook.com/messages;x',
    'https://www.facebook.com/messages%2Ft/1',
    'https://www.facebook.com/messages.php',
    'https://x.com/messages%3F',
    'https://www.facebook.com/%E0%A4%A', // undecodable path counts as private
  ]) {
    assert.equal(P.mayShareFrom(url, ON), false, url);
  }
  assert.equal(P.mayShareFrom('https://www.facebook.com/kyivcity/posts/1', ON), true, 'public post');
  assert.equal(P.mayShareFrom('https://www.facebook.com/messagesforyou', ON), true, 'prefix must be a whole segment');
});

test('only the page host may be sent about the page', () => {
  assert.equal(P.pageHost('https://site.ua/reset?token=SECRET#x'), 'site.ua');
  assert.equal(P.pageHost('https://user:pw@Site.UA./invite/abc'), 'site.ua');
  assert.equal(P.pageHost('file:///Users/me/a.html'), null);
  assert.equal(P.pageHost('not a url'), null);
});

test('only public item URLs are sent', () => {
  assert.equal(P.mayShareUrl('https://cdn.site.ua/news/photo.jpg'), true);
  assert.equal(P.mayShareUrl('https://cdn.site.ua/news/photo.jpg?w=800&q=80'), true, 'resize params are fine');
  for (const url of [
    'https://bucket.s3.amazonaws.com/a.jpg?X-Amz-Signature=abc&X-Amz-Credential=x',
    'https://storage.googleapis.com/b/a.jpg?X-Goog-Signature=abc',
    'https://acct.blob.core.windows.net/c/a.jpg?sv=2020&sig=abc',
    'https://d1.cloudfront.net/a.jpg?Policy=x&Signature=y&Key-Pair-Id=z',
    'https://site.ua/a.jpg?token=abc',
    'https://site.ua/a.jpg?ACCESS_TOKEN=abc',
    'https://site.ua/a.jpg?key=abc',
    'https://site.ua/a.jpg#access_token=abc',
    'https://site.ua/a.jpg?auth_token=x',
    'https://site.ua/a.jpg?access-token=x',
    'https://site.ua/a.jpg?id_token=x',
    'https://site.ua/a.jpg?token[]=x',
    'https://site.ua/a.jpg?%74oken=x',
    'https://site.ua/a.jpg?secret=1',
    'https://site.ua/a.jpg?password=1',
    'https://site.ua/a.jpg?code=1',
    'https://site.ua/a.jpg?hmac=1',
    'https://site.ua/a.jpg?a=1;token=x',
    'https://site.ua/img;jsessionid=ABC/a.jpg',
    'https://site.ua/#/p?token=x',
    'https://site.ua/a.jpg#K3yWithoutEquals', // any fragment: fetching never needs it
    'https://mega.nz/file/abc#key',
    'https://site.ua/a.jpg?a=b#c%3Dd',
    'https://site.ua/pixel.gif?email=me@x.ua',
    'https://site.ua/a.jpg?user_phone=380',
    'https://site.ua/a.jpg?otp=1',
    'https://site.ua/a.jpg?pwd=1',
    'https://site.ua/a.jpg?pin=1',
    'https://site.ua/a.jpg?ticket=1',
    'https://ton.twitter.com/1.1/ton/data/dm/1/2/a.jpg', // X direct-message media
    'https://www.facebook.com/messages/t/1/a.jpg', // item on a private path
    'https://scontent-waw2-1.xx.fbcdn.net/v/t39/1_n.jpg?_nc_cat=1&oh=00_abc&oe=65A1B2C3',
    'data:image/png;base64,iVBORw0KGgo=',
    'blob:https://site.ua/1234-5678',
    'https://user:pass@site.ua/a.jpg',
    'http://10.0.0.5/img.png',
    'https://mail.google.com/mail/u/0/?view=att&th=1',
    '/relative/photo.jpg',
    'ftp://site.ua/a.jpg',
  ]) {
    assert.equal(P.mayShareUrl(url), false, url);
  }
});

test('item URLs respect the user settings when given', () => {
  const img = 'https://cdn.example.ua/a.jpg';
  assert.equal(P.mayShareUrl(img), true, 'base rules only');
  assert.equal(P.mayShareUrl(img, ON), true);
  assert.equal(P.mayShareUrl(img, { ai: true, privateSites: ['example.ua'] }), false, 'item host excluded by the user');
  assert.equal(P.mayShareUrl(img, { ai: false }), false, 'AI off');
  assert.equal(P.mayShareUrl(img, { ai: true, privateSites: 'x' }), false, 'malformed settings');
});

test('unexpected input fails closed', () => {
  const evil = { toString() { throw new Error('boom'); } };
  assert.equal(P.mayShareFrom(evil, ON), false);
  assert.equal(P.mayShareUrl(evil), false);
  assert.equal(P.mayShareFrom('https://site.ua/', { ai: true, privateSites: [evil] }), false);
  assert.equal(P.isPublicHost(evil), false);
  assert.equal(P.isPrivateHost(evil), true);
  assert.equal(P.pageLooksPrivate(null), true);
});

test('the API is frozen', () => {
  assert.throws(() => { 'use strict'; P.mayShareFrom = () => true; });
  assert.throws(() => { 'use strict'; P.PRIVATE_DOMAINS.push('x.ua'); });
});

// Background loading paths, as each browser does it (manifest.json background):
//  - Firefox: an event page running background.scripts in order, no importScripts;
//  - Chrome: a service worker running background.js alone, which importScripts privacy.js.
// (Chrome is also covered for real by test/e2e-extension.mjs; real Firefox is checked by hand,
// see docs/ROADMAP.md, Weekend 4.)
const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const backgroundContext = (extra = {}) => {
  const listener = { addListener: () => {} };
  const bg = vm.createContext({
    URL, URLSearchParams, console,
    chrome: { runtime: { onInstalled: listener, onMessage: listener }, commands: { onCommand: listener } },
    ...extra,
  });
  bg.globalThis = bg;
  return bg;
};
const runIn = (bg, file) =>
  vm.runInContext(readFileSync(path.join(root, 'extension', file), 'utf8'), bg, { filename: file });

test('Firefox background: manifest scripts load the gate without importScripts', () => {
  const scripts = manifest.background.scripts;
  assert.ok(scripts.indexOf('src/privacy.js') > -1 && scripts.indexOf('src/privacy.js') < scripts.indexOf('src/background.js'),
    'privacy.js is listed before background.js');
  const bg = backgroundContext(); // no importScripts, like Firefox's event page
  for (const file of scripts) runIn(bg, file);
  assert.equal(typeof bg.Dostupno?.privacy?.mayShareFrom, 'function');
  assert.equal(bg.Dostupno.privacy.mayShareFrom('https://privatbank.ua/', ON), false);
});

test('Chrome background: the service worker imports the gate once', () => {
  const imported = [];
  const bg = backgroundContext({
    importScripts: (...files) => {
      imported.push(...files);
      // Resolved relative to the worker script, src/background.js.
      for (const f of files) runIn(bg, path.posix.join(path.posix.dirname(manifest.background.service_worker), f));
    },
  });
  runIn(bg, manifest.background.service_worker);
  assert.deepEqual(imported, ['privacy.js']);
  assert.equal(bg.Dostupno.privacy.mayShareFrom('https://privatbank.ua/', ON), false);
});

test('pages with secret fields look private (Chromium)', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const looksPrivate = async (html) => {
      await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
      await page.addScriptTag({ content: source });
      return page.evaluate(() => window.Dostupno.privacy.pageLooksPrivate(document));
    };

    assert.equal(await looksPrivate('<form><input name="u"><input type="password" name="p"></form>'), true, 'login form');
    assert.equal(await looksPrivate('<input type="PASSWORD">'), true, 'type is case-insensitive');
    assert.equal(await looksPrivate('<input autocomplete="billing cc-number">'), true, 'card number');
    assert.equal(await looksPrivate('<input autocomplete="one-time-code">'), true, 'one-time code');
    assert.equal(await looksPrivate('<input autocomplete="new-password" type="text">'), true, 'new password');
    assert.equal(await looksPrivate('<div hidden><input type="password"></div>'), true, 'hidden fields count too');
    assert.equal(await looksPrivate('<iframe src="https://www.liqpay.ua/checkout/123"></iframe>'), true, 'payment widget');
    assert.equal(await looksPrivate('<iframe src="https://js.stripe.com/v3/elements-inner-card.html"></iframe>'), true,
      'Stripe card iframe on a shop checkout');
    assert.equal(await looksPrivate('<iframe src="https://assets.braintreegateway.com/web/hosted-fields.html"></iframe>'), true,
      'Braintree hosted fields');
    assert.equal(await looksPrivate('<sl-input type="password"></sl-input>'), true, 'custom element host with type=password');
    assert.equal(await looksPrivate('<input name="cardNumber"><input name="cvv">'), true, 'card fields without autocomplete');
    for (const src of ['https://checkoutshopper-live.adyen.com/x', 'https://pay.google.com/gp/p/ui/pay',
      'https://js.checkout.com/frames/', 'https://www.paypal.com/smart/buttons']) {
      assert.equal(await looksPrivate(`<iframe src="${src}"></iframe>`), true, src);
    }
    assert.equal(await looksPrivate('<iframe srcdoc="<form><input type=password></form>"></iframe>'), true,
      'password field in a same-origin frame');
    assert.equal(await looksPrivate(`<div id="host"></div><script>
        let host = document.getElementById('host');
        for (let i = 0; i < 25; i++) { const r = host.attachShadow({ mode: 'open' }); r.innerHTML = '<div></div>'; host = r.firstChild; }
      </script>`), true, 'absurdly deep Shadow DOM counts as private');
    // Open shadow roots, nested two levels (closed roots need the content-script API, not available here).
    assert.equal(await looksPrivate(`<login-box></login-box><script>
        const outer = document.querySelector('login-box').attachShadow({ mode: 'open' });
        outer.innerHTML = '<div><pw-field></pw-field></div>';
        outer.querySelector('pw-field').attachShadow({ mode: 'open' }).innerHTML = '<input type="password">';
      </script>`), true, 'password field inside nested Shadow DOM');
    assert.equal(await looksPrivate(`<news-card></news-card><script>
        document.querySelector('news-card').attachShadow({ mode: 'open' }).innerHTML = '<p>Новина</p><img src="a.jpg" alt="">';
      </script>`), false, 'harmless Shadow DOM');

    assert.equal(
      await looksPrivate(`
        <header><form role="search"><input type="search" name="q" placeholder="Пошук"></form></header>
        <article><h1>Новини громади</h1><img src="https://cdn.site.ua/a.jpg" alt=""><p>Текст.</p>
        <iframe src="https://www.youtube.com/embed/x"></iframe>
        <form><input type="email" autocomplete="email" placeholder="Ваш email"></form></article>`),
      false,
      'plain article with search, video and newsletter field',
    );
  } finally {
    await browser.close();
  }
});
