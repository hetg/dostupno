/**
 * Content script entry point.
 * Reads settings, runs fixers on the page, keeps watching for new content
 * (single-page apps, infinite scroll, popups), and reverts everything when
 * the user turns Доступно off for this site.
 */
(() => {
  const D = window.Dostupno;
  const host = location.hostname;

  const DEFAULTS = {
    enabled: true,
    profiles: { screenreader: true, lowvision: false },
    disabledSites: [],
    ai: false, // AI descriptions are opt-in (see privacy.js)
    privateSites: [], // never send anything from these sites (local fixes still run)
  };

  let settings = DEFAULTS;
  let active = false;
  let observer = null;

  const activeProfiles = () => {
    const p = Object.entries(settings.profiles).filter(([, on]) => on).map(([k]) => k);
    return new Set(['all', ...p]);
  };

  const runFixers = (root, initial) => {
    const profiles = activeProfiles();
    // Fixers get a frozen copy of the settings (the ai-images fixer needs ai/privateSites).
    const ctx = { initial, profiles, settings: Object.freeze({ ...settings }) };
    const started = performance.now();
    for (const fixer of D.fixers) {
      if (!fixer.profiles.some((p) => profiles.has(p))) continue;
      try {
        fixer.run(root, ctx);
      } catch (err) {
        // A broken fixer must never break the page or the other fixers.
        console.warn('[Доступно] fixer failed:', fixer.id, err);
      }
    }
    D.log(`fixers on ${initial ? 'page' : 'subtree'}: ${(performance.now() - started).toFixed(1)}ms, changes: ${D.changes.count()}`);
  };

  // Batch DOM changes; run fixers on added subtrees only.
  let pending = new Set();
  let timer = null;
  const flush = () => {
    timer = null;
    const roots = [...pending].filter((n) => n.isConnected);
    pending = new Set();
    for (const root of roots) runFixers(root, false);
  };

  const startObserving = () => {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.id === 'dostupno-live' || node.hasAttribute('data-dostupno-style')) continue;
          pending.add(node);
        }
      }
      if (pending.size && !timer) timer = setTimeout(flush, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const activate = () => {
    if (active) return;
    active = true;
    runFixers(document.body, true);
    startObserving();
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    observer?.disconnect();
    observer = null;
    clearTimeout(timer);
    timer = null;
    pending.clear();
    for (const fixer of D.fixers) {
      try {
        fixer.stop?.(); // fixers with observers or timers must stop touching the page
      } catch (err) {
        console.warn('[Доступно] fixer stop failed:', fixer.id, err);
      }
    }
    D.changes.revertAll();
  };

  const shouldRun = () => settings.enabled && !settings.disabledSites.includes(host);
  /** May this page send anything (AI)? Same gate the ai-images fixer and background use. */
  const mayShareHere = () => !!D.privacy?.mayShareFrom(location.href, settings);

  /**
   * Tell the background whether Доступно runs on this page, for the toolbar
   * icon. Fire-and-forget: if the extension was reloaded or the worker is gone,
   * the page must not notice.
   */
  const reportState = () => {
    if (document.prerendering) return; // not shown yet: report on activation
    try {
      const sent = chrome.runtime.sendMessage({ type: 'dostupno:state', active });
      if (sent && typeof sent.catch === 'function') sent.catch(() => {});
    } catch (_) {
      // No background to tell (tests, extension reloaded): nothing to do.
    }
  };

  const apply = () => {
    if (shouldRun()) {
      deactivate(); // profiles may have changed: start clean
      activate();
    } else deactivate();
    reportState();
  };

  // The browser resets the tab's icon on navigation; these pages come back
  // without this script running again, so report again ourselves.
  addEventListener('pageshow', (e) => e.persisted && reportState()); // back/forward cache
  if (document.prerendering) document.addEventListener('prerenderingchange', reportState, { once: true });

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    apply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const wasRunning = shouldRun();
    const wasSharing = mayShareHere();
    settings = { ...settings };
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue ?? DEFAULTS[key];
    const nowRunning = shouldRun();
    // Re-run from scratch when profiles change, when AI is turned on or off, or when the
    // user's exclusions change whether this page may send: AI descriptions appear or go.
    // AI descriptions belong to the screen reader profile: without it nothing changes (and a
    // low-vision user doesn't see contrast fixes flicker for nothing).
    const sendingChanged = settings.profiles?.screenreader === true &&
      (changes.ai || (changes.privateSites && wasSharing !== mayShareHere()));
    if (changes.profiles || sendingChanged) apply();
    else if (wasRunning !== nowRunning) nowRunning ? activate() : deactivate();
    if (wasRunning !== nowRunning) {
      D.announce(nowRunning ? 'Доступно увімкнено на цьому сайті' : 'Доступно вимкнено на цьому сайті');
      reportState();
    }
  });

  // For the popup: report what we did on this page.
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'dostupno:status') {
      reply({
        host,
        active,
        changes: D.changes.count(),
        needsAi: document.querySelectorAll('[data-dostupno-needs-ai]').length,
      });
    }
  });
})();
