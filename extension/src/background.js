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
