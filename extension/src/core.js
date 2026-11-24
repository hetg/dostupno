/**
 * Доступно — shared core for all fixers.
 *
 * Content scripts in MV3 can't be ES modules, so every file attaches to one
 * global namespace: window.Dostupno. Load order is set in manifest.json.
 *
 * Golden rule: every change goes through Dostupno.changes so it can be
 * reverted instantly when the user turns the extension off on a site.
 */
(() => {
  const D = (window.Dostupno = window.Dostupno || {});

  /** Registry of fixers. Each: { id, profiles: [...], run(root, ctx) } */
  D.fixers = [];
  D.registerFixer = (fixer) => D.fixers.push(fixer);

  // ---------------------------------------------------------------------------
  // Change log: record the original value before touching anything.
  // ---------------------------------------------------------------------------
  const log = []; // { el, kind: 'attr' | 'style', name, oldValue, oldPriority }

  D.changes = {
    /** Set an attribute, remembering the original value (null = absent). */
    setAttr(el, name, value) {
      if (el.getAttribute(name) === value) return;
      log.push({ el, kind: 'attr', name, oldValue: el.getAttribute(name) });
      el.setAttribute(name, value);
      el.setAttribute('data-dostupno', '');
    },

    /** Set an inline style property with !important, remembering the original. */
    setStyle(el, prop, value) {
      log.push({
        el,
        kind: 'style',
        name: prop,
        oldValue: el.style.getPropertyValue(prop),
        oldPriority: el.style.getPropertyPriority(prop),
      });
      el.style.setProperty(prop, value, 'important');
      el.setAttribute('data-dostupno', '');
    },

    /** Inject a stylesheet once per id. */
    addStyle(id, css) {
      if (document.getElementById(id)) return;
      const style = document.createElement('style');
      style.id = id;
      style.setAttribute('data-dostupno-style', '');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    },

    /** Undo everything, newest first. */
    revertAll() {
      for (let i = log.length - 1; i >= 0; i--) {
        const c = log[i];
        if (c.kind === 'attr') {
          if (c.oldValue === null) c.el.removeAttribute(c.name);
          else c.el.setAttribute(c.name, c.oldValue);
        } else {
          c.el.style.removeProperty(c.name);
          if (c.oldValue) c.el.style.setProperty(c.name, c.oldValue, c.oldPriority);
        }
        c.el.removeAttribute('data-dostupno');
      }
      log.length = 0;
      document.querySelectorAll('[data-dostupno-style]').forEach((s) => s.remove());
      processed = new WeakMap();
    },

    count: () => log.length,
  };

  // ---------------------------------------------------------------------------
  // "Already handled" tracking, per fixer, so re-runs on DOM changes are cheap.
  // ---------------------------------------------------------------------------
  let processed = new WeakMap(); // el -> Set(fixerId)

  D.once = (el, fixerId) => {
    let set = processed.get(el);
    if (!set) processed.set(el, (set = new Set()));
    if (set.has(fixerId)) return false;
    set.add(fixerId);
    return true;
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Query root and its descendants (root itself may match). */
  D.queryAll = (root, selector) => {
    const out = [];
    if (root.nodeType === 1 && root.matches(selector)) out.push(root);
    if (root.querySelectorAll) out.push(...root.querySelectorAll(selector));
    return out;
  };

  D.isHidden = (el) => {
    if (el.closest('[hidden], [aria-hidden="true"]')) return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden';
  };

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  D.clean = clean;

  /**
   * Approximate accessible name (simplified accname algorithm).
   * Good enough to decide "does this element have a name at all?".
   */
  D.accessibleName = (el) => {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => n.textContent)
        .join(' ');
      if (clean(text)) return clean(text);
    }
    if (clean(el.getAttribute('aria-label'))) return clean(el.getAttribute('aria-label'));

    if (el.labels && el.labels.length) {
      const t = clean([...el.labels].map((l) => l.textContent).join(' '));
      if (t) return t;
    }

    // Visible text, plus alt of images and <title> of svgs inside.
    let text = '';
    const walk = (node) => {
      if (node.nodeType === 3) text += ' ' + node.nodeValue;
      else if (node.nodeType === 1) {
        if (node.getAttribute('aria-hidden') === 'true') return;
        if (node.tagName === 'IMG') text += ' ' + (node.getAttribute('alt') || '');
        else if (node.tagName.toLowerCase() === 'svg') {
          const t = node.querySelector('title');
          text += ' ' + (node.getAttribute('aria-label') || (t ? t.textContent : ''));
        } else node.childNodes.forEach(walk);
      }
    };
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) el.childNodes.forEach(walk);
    if (clean(text)) return clean(text);

    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type) && clean(el.value))
      return clean(el.value);

    return clean(el.getAttribute('title'));
  };

  // ---------------------------------------------------------------------------
  // Announcements for screen readers (used only for on/off confirmations).
  // ---------------------------------------------------------------------------
  D.announce = (message) => {
    let region = document.getElementById('dostupno-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'dostupno-live';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.style.cssText =
        'position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;';
      document.body.appendChild(region);
    }
    region.textContent = '';
    setTimeout(() => (region.textContent = message), 50);
  };

  D.debug = false;
  D.log = (...args) => D.debug && console.log('[Доступно]', ...args);
})();
