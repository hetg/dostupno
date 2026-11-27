/**
 * Background (service worker in Chrome, event page in Firefox).
 * - Keyboard shortcut: toggle Доступно for the current site.
 * - First install: open the welcome page so the user can pick a profile.
 * - Toolbar icon: shows per tab whether Доступно runs on the page.
 * - Privacy gate (privacy.js): Firefox loads it from manifest background.scripts;
 *   Chrome's service worker has no such list, so it is imported here.
 *   Anything this script ever sends to a server must pass Dostupno.privacy first,
 *   checked against sender.url (the browser-reported page URL).
 */
/* global importScripts */
if (typeof importScripts === 'function' && !globalThis.Dostupno?.privacy) importScripts('privacy.js');

const DEFAULTS = {
  enabled: true,
  profiles: { screenreader: true, lowvision: false },
  disabledSites: [],
  ai: false, // AI descriptions are opt-in
  privateSites: [], // never send anything from these sites (Доступно still fixes them)
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?welcome=1') });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-site') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch (_) {
    return;
  }
  if (!host) return;

  const { disabledSites } = await chrome.storage.sync.get(DEFAULTS);
  const next = disabledSites.includes(host)
    ? disabledSites.filter((h) => h !== host)
    : [...disabledSites, host];
  await chrome.storage.sync.set({ disabledSites: next });
  // The content script announces the change to screen readers.
});

// ---------------------------------------------------------------------------
// Toolbar icon: on (yellow "Д" on navy) or off (grey, crossed out) per tab.
// Pages report their state: early-state.js at document_start, content.js when
// it (de)activates, after a back/forward-cache restore and after prerender
// activation. The browser resets per-tab icons on every navigation, so pages
// without a content script (browser pages, opened before install) show the
// manifest default. Per-tab only, so a failure can't mark every tab "off".
// ---------------------------------------------------------------------------
const ICON_ON = { 16: '/icons/icon-16.png', 32: '/icons/icon-32.png' };
const ICON_OFF = { 16: '/icons/icon-off-16.png', 32: '/icons/icon-off-32.png' };
const TITLE_ON = 'Доступно: увімкнено на цьому сайті';
const TITLE_OFF = 'Доступно: вимкнено на цьому сайті';

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'dostupno:state' || sender.tab?.id === undefined) return;
  const tabId = sender.tab.id;
  // Errors (tab closed meanwhile) don't matter.
  Promise.all([
    chrome.action.setIcon({ tabId, path: msg.active ? ICON_ON : ICON_OFF }),
    chrome.action.setTitle({ tabId, title: msg.active ? TITLE_ON : TITLE_OFF }),
  ]).catch(() => {});
});

// ---------------------------------------------------------------------------
// AI descriptions relay. The page (ai-images fixer) never talks to the backend:
// it asks here, and this is the authoritative privacy check, because sender.url
// is reported by the browser and can't be faked by page scripts.
// ---------------------------------------------------------------------------

/** Backend address for release builds. Empty until change 3 deploys the backend. */
const BACKEND_URL = '';
const DATA_COLLECTION = ['websiteContent', 'browsingActivity'];
const MAX_ITEMS = 8;
const MAX_CONTEXT = 300;
const MAX_URL = 2048; // the backend rejects longer ones (and the whole batch with them)
const TIMEOUT_MS = 15000; // the backend answers within ~11 s (5 s image fetch + 6 s model)
const NO_RESULT = Object.freeze({ alt: null, decorative: false });

const isFirefox = typeof chrome.runtime.getBrowserInfo === 'function';

/**
 * Backend address: BACKEND_URL, or in an unpacked (development) install the
 * storage.local devBackendUrl override (e2e tests, `wrangler dev`). '' = AI unavailable.
 */
async function backendUrl() {
  if (BACKEND_URL) return BACKEND_URL;
  try {
    const self = await chrome.management.getSelf();
    if (self.installType !== 'development') return '';
    const { devBackendUrl } = await chrome.storage.local.get({ devBackendUrl: '' });
    return typeof devBackendUrl === 'string' && /^https?:\/\//.test(devBackendUrl) ? devBackendUrl.replace(/\/+$/, '') : '';
  } catch (_) {
    return '';
  }
}

/** Firefox asks for data-collection consent when the user opts in; it can be revoked later. */
async function hasConsent() {
  if (!isFirefox) return true;
  try {
    return await chrome.permissions.contains({ data_collection: DATA_COLLECTION });
  } catch (_) {
    return false;
  }
}

// Small in-memory cache of successful descriptions, by image URL (most recent last).
const recent = new Map();
const RECENT_MAX = 500;
const remember = (url, value) => {
  recent.delete(url);
  recent.set(url, value);
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
};

async function describeForPage(items, sender) {
  const empty = items.map(() => NO_RESULT);
  const P = globalThis.Dostupno?.privacy;
  if (!P) return empty;
  const settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  // AI descriptions belong to the screen reader profile; nothing is sent without it.
  if (settings.profiles?.screenreader !== true) return empty;
  if (!P.mayShareFrom(sender.url, settings) || !(await hasConsent())) return empty;
  const base = await backendUrl();
  if (!base) return empty;

  const results = [...empty];
  const toSend = [];
  items.forEach((item, i) => {
    const url = item?.imageUrl;
    if (typeof url !== 'string' || url.length > MAX_URL || !P.mayShareUrl(url, settings)) return;
    if (recent.has(url)) {
      results[i] = recent.get(url);
      return;
    }
    const context = typeof item.context === 'string' ? item.context.slice(0, MAX_CONTEXT) : '';
    toSend.push({ i, imageUrl: url, context });
  });
  if (!toSend.length) return results;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/v1/describe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Only the page host, the image URLs and short nearby text. Nothing else.
      body: JSON.stringify({
        pageHost: P.pageHost(sender.url),
        lang: 'uk',
        items: toSend.map(({ imageUrl, context }) => ({ imageUrl, context })),
      }),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) return results;
    const data = await response.json();
    const answers = Array.isArray(data?.results) ? data.results : [];
    toSend.forEach(({ i, imageUrl }, k) => {
      const a = answers[k];
      if (!a || typeof a.alt !== 'string') return;
      const value = Object.freeze({ alt: a.alt, decorative: a.decorative === true });
      results[i] = value;
      remember(imageUrl, value);
    });
    return results;
  } catch (_) {
    return results; // unreachable, timeout, bad JSON: no descriptions
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return undefined;

  if (msg?.type === 'dostupno:ai-available') {
    backendUrl().then((url) => sendResponse({ available: !!url }), () => sendResponse({ available: false }));
    return true;
  }

  if (msg?.type === 'dostupno:describe') {
    // Only from a page's top frame (content scripts run there only).
    const items = Array.isArray(msg.items) ? msg.items.slice(0, MAX_ITEMS) : [];
    if (sender.tab?.id === undefined || sender.frameId !== 0 || !items.length) {
      sendResponse({ results: items.map(() => NO_RESULT) });
      return undefined;
    }
    describeForPage(items, sender).then(
      (results) => sendResponse({ results }),
      () => sendResponse({ results: items.map(() => NO_RESULT) }),
    );
    return true; // answer asynchronously
  }
  return undefined;
});
