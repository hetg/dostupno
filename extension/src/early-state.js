/**
 * Runs at document_start, before the page loads: tells the background right
 * away whether Доступно is on for this site, so the toolbar icon is right while
 * a slow page is still loading. content.js confirms it once the fixers run.
 * Touches nothing on the page.
 */
(() => {
  // A prerendered page isn't shown yet; content.js reports when it's activated.
  if (document.prerendering) return;
  const DEFAULTS = { enabled: true, disabledSites: [] };
  try {
    chrome.storage.sync.get(DEFAULTS, (s) => {
      const active = !!s.enabled && !(s.disabledSites || []).includes(location.hostname);
      try {
        const sent = chrome.runtime.sendMessage({ type: 'dostupno:state', active });
        if (sent && typeof sent.catch === 'function') sent.catch(() => {});
      } catch (_) {
        // Extension reloaded: nothing to tell.
      }
    });
  } catch (_) {
    // No extension APIs here: nothing to do.
  }
})();
