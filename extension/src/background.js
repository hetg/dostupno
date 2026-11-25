/**
 * Background (service worker in Chrome, event page in Firefox).
 * - Keyboard shortcut: toggle Доступно for the current site.
 * - First install: open the welcome page so the user can pick a profile.
 * - Toolbar icon: shows per tab whether Доступно runs on the page.
 */
const DEFAULTS = {
  enabled: true,
  profiles: { screenreader: true, lowvision: false },
  disabledSites: [],
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
// The content script reports its state (push); after each page load we also
// ask it (pull), which covers back/forward cache and in-page navigations.
// Tabs without a content script (browser pages, opened before install) get
// the manifest default. Per-tab only, so a failure can't mark every tab "off".
// ---------------------------------------------------------------------------
const ICON_ON = { 16: '/icons/icon-16.png', 32: '/icons/icon-32.png' };
const ICON_OFF = { 16: '/icons/icon-off-16.png', 32: '/icons/icon-off-32.png' };
const TITLE = {
  on: 'Доступно: увімкнено на цьому сайті',
  off: 'Доступно: вимкнено на цьому сайті',
  unknown: 'Доступно',
};

/** state: 'on' | 'off' | 'unknown'. Errors (tab closed meanwhile) are ignored. */
const showState = (tabId, state) => {
  const path = state === 'off' ? ICON_OFF : ICON_ON;
  Promise.all([
    chrome.action.setIcon({ tabId, path }),
    chrome.action.setTitle({ tabId, title: TITLE[state] }),
  ]).catch(() => {});
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'dostupno:state' || sender.tab?.id === undefined) return;
  if (sender.frameId) return; // only the top frame speaks for the tab
  showState(sender.tab.id, msg.active ? 'on' : 'off');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  chrome.tabs
    .sendMessage(tabId, { type: 'dostupno:status' })
    .then((status) => showState(tabId, status ? (status.active ? 'on' : 'off') : 'unknown'))
    .catch(() => showState(tabId, 'unknown')); // no content script in this tab
});
