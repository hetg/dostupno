/**
 * Background (service worker in Chrome, event page in Firefox).
 * - Keyboard shortcut: toggle Доступно for the current site.
 * - First install: open the welcome page so the user can pick a profile.
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
