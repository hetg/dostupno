/**
 * Popup and welcome page (same file; ?welcome=1 on first install).
 */
const DEFAULTS = {
  enabled: true,
  profiles: { screenreader: true, lowvision: false },
  disabledSites: [],
  ai: false,
  privateSites: [],
};

const $ = (id) => document.getElementById(id);
const isWelcome = new URLSearchParams(location.search).has('welcome');
const isFirefox = typeof chrome.runtime.getBrowserInfo === 'function';
// Firefox asks for the browser's data-collection consent before AI descriptions are on.
const DATA_COLLECTION = ['websiteContent', 'browsingActivity'];

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol.startsWith('http') ? u.hostname : null;
  } catch (_) {
    return null;
  }
}

function renderSite(host, disabledSites) {
  const on = !disabledSites.includes(host);
  const btn = $('site-toggle');
  // A switch keeps one name; the screen reader announces on/off by itself.
  btn.setAttribute('aria-checked', String(on));
  btn.setAttribute('aria-label', `Доступно на сайті ${host}`);
  $('site-state').textContent = on ? 'Увімкнено на цьому сайті' : 'Вимкнено на цьому сайті';
  $('site-host').textContent = host;
}

async function renderStatus(tab) {
  try {
    const s = await chrome.tabs.sendMessage(tab.id, { type: 'dostupno:status' });
    if (!s) return;
    if (!s.active) {
      $('site-status').textContent = '';
      return;
    }
    $('site-status').textContent =
      s.changes === 0
        ? 'На цій сторінці нічого не довелося виправляти.'
        : `Виправлено ${s.changes} ${plural(s.changes, 'елемент', 'елементи', 'елементів')} на цій сторінці.`;
  } catch (_) {
    // Page loaded before install, or a browser page: the content script isn't there.
    $('site-status').textContent = 'Оновіть сторінку, щоб Доступно почав працювати.';
  }
}

/** Is a backend configured? Without one, no AI controls are shown at all. */
async function aiAvailable() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'dostupno:ai-available' });
    return r?.available === true;
  } catch (_) {
    return false;
  }
}

/** Per-site sending control: a checkbox, or a note when the site is private anyway. */
function renderAiSite(tab, host, settings) {
  const box = $('ai-site');
  box.hidden = !(settings.ai && host);
  if (box.hidden) return;
  const privateAnyway = !window.Dostupno?.privacy?.mayShareFrom(tab.url, { ai: true });
  $('ai-site-choice').hidden = privateAnyway;
  $('ai-site-private').hidden = !privateAnyway;
  $('ai-site-host').textContent = host;
  $('ai-site-toggle').checked = settings.privateSites.includes(host);
}

async function initAi(tab, host) {
  if (!(await aiAvailable())) return; // release build before deploy: no trace of AI
  $('ai-section').hidden = false;
  const toggle = $('ai-toggle');
  const settings = await chrome.storage.sync.get(DEFAULTS);
  // In Firefox, ai may be synced from another browser without this browser's consent:
  // nothing is sent then, so don't show it as on.
  const consented = !isFirefox || await chrome.permissions
    .contains({ data_collection: DATA_COLLECTION }).catch(() => false);
  settings.ai = settings.ai === true && consented;
  toggle.checked = settings.ai;
  if (!isWelcome) renderAiSite(tab, host, settings);

  toggle.addEventListener('change', async () => {
    if (toggle.checked && isFirefox) {
      // Must be the first call in the handler: Firefox needs the user's click for the prompt.
      let request;
      try {
        request = chrome.permissions.request({ data_collection: DATA_COLLECTION });
      } catch (_) {
        request = Promise.resolve(false);
      }
      const granted = await Promise.resolve(request).catch(() => false);
      if (!granted) {
        toggle.checked = false;
        return;
      }
    }
    await chrome.storage.sync.set({ ai: toggle.checked });
    if (isWelcome) $('welcome-done').hidden = false;
    else renderAiSite(tab, host, await chrome.storage.sync.get(DEFAULTS));
  });

  $('ai-site-toggle').addEventListener('change', async () => {
    const { privateSites } = await chrome.storage.sync.get(DEFAULTS);
    const next = $('ai-site-toggle').checked
      ? [...new Set([...privateSites, host])]
      : privateSites.filter((h) => h !== host);
    await chrome.storage.sync.set({ privateSites: next });
  });
}

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULTS);

  const tab = isWelcome ? null : await currentTab();
  const host = tab && hostOf(tab.url);

  // Profiles
  const form = $('profiles');
  for (const [name, on] of Object.entries(settings.profiles)) {
    const input = form.elements[name];
    if (input) input.checked = on;
  }
  form.addEventListener('change', async () => {
    const profiles = {
      screenreader: form.elements.screenreader.checked,
      lowvision: form.elements.lowvision.checked,
    };
    await chrome.storage.sync.set({ profiles });
    if (isWelcome) $('welcome-done').hidden = false;
    // The page re-runs its fixers with the new profiles: show the new count.
    else if (host) setTimeout(() => renderStatus(tab), 150);
  });

  if (isWelcome) {
    document.title = 'Вітаємо в Доступно';
    $('title').textContent = 'Вітаємо в Доступно';
    $('welcome-intro').hidden = false;
    $('site-section').hidden = true;
    form.elements.screenreader.focus();
    await initAi(null, null);
    return;
  }

  initAi(tab, host).catch(() => {}); // don't hold up the site switch for the background round trip

  // Site toggle
  if (!host) {
    $('site-section').hidden = true;
    return;
  }
  renderSite(host, settings.disabledSites);
  renderStatus(tab);

  $('site-toggle').addEventListener('click', async () => {
    const { disabledSites } = await chrome.storage.sync.get(DEFAULTS);
    const next = disabledSites.includes(host)
      ? disabledSites.filter((h) => h !== host)
      : [...disabledSites, host];
    await chrome.storage.sync.set({ disabledSites: next });
    renderSite(host, next);
    setTimeout(() => renderStatus(tab), 150);
  });
}

init();
