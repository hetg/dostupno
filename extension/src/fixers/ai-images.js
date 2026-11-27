/**
 * Fixer: AI descriptions for images the images fixer couldn't decide
 * (data-dostupno-needs-ai="alt"). Runs only when the user opted in (settings.ai) and the
 * privacy gate allows the page and each image URL.
 *
 * Flow: flagged images near the viewport → batch (≤ 8, 400 ms) → gate checks →
 * background ('dostupno:describe', which checks the gate again and calls the backend) →
 * alt="ШІ: …" or alt="" via Dostupno.changes, flag removed. Anything unexpected leaves the
 * image as it was. If the site later swaps the image, our description is withdrawn.
 * stop() cancels everything; late answers are ignored.
 */
(() => {
  const D = window.Dostupno;

  const FLAG = 'data-dostupno-needs-ai';
  const PREFIX = 'ШІ: ';
  const MAX_BATCH = 8;
  const DEBOUNCE_MS = 400;
  const MAX_CONTEXT = 300;
  const MAX_ALT = 200;
  const MIN_SIZE = 24; // smaller (or invisible) images are pixels and icons, not content
  const CARD_TEXT_MAX = 200; // longer wrapper text is page content, not a card caption

  // Areas whose images are about the site or the signed-in user, not the page's content.
  const SKIP_AREAS = 'header, nav, [role="banner"], [role="navigation"]';
  const PERSONAL = /avatar|userpic|user-?photo|profile-?(pic|img|photo|image)|gravatar|account/i;
  // Never part of context: hidden, non-rendered or fallback markup.
  const NO_TEXT = 'script, style, noscript, template, [hidden], [aria-hidden="true"], input, textarea, select, option, button';
  // Personal or identifying strings are dropped from context.
  const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const URLISH = /https?:\/\/|www\.|<[a-z]/i;
  const PHONE = /\+?\d[\d\s()-]{7,}\d/;

  let settings = null;
  let observer = null;
  let queue = [];
  let timer = null;
  let generation = 0; // bumped by stop(): answers from an older generation are dropped
  let asked = new WeakSet(); // asked (or given up on) during this page view
  let retried = new WeakSet(); // lazy images get one retry after they load
  const waitingLoad = new Map(); // img -> load handler
  const described = new Map(); // img -> { url, onChange } for descriptions we applied

  const srcOf = (img) => img.currentSrc || img.src;
  const loaded = (img) => img.complete && img.naturalWidth > 0;

  /** Tracking pixels and invisible images aren't worth describing (or fetching). */
  const tooSmall = (img) => {
    if (img.naturalWidth <= MIN_SIZE || img.naturalHeight <= MIN_SIZE) return true;
    const box = img.getBoundingClientRect();
    return box.width < MIN_SIZE || box.height < MIN_SIZE;
  };

  /** Site chrome and people's pictures: not described, never sent. */
  const offLimits = (img) => {
    if (img.closest(SKIP_AREAS)) return true;
    const hints = `${img.className} ${img.id} ${srcOf(img)}`;
    return PERSONAL.test(hints) || !!img.closest('[class*="avatar" i], [class*="userpic" i]');
  };

  /** Still worth describing: in the page, still flagged, no real alt, no ARIA name. */
  const stillWanted = (img) => {
    if (!img.isConnected || img.getAttribute(FLAG) !== 'alt') return false;
    if (D.clean(img.getAttribute('aria-label')) || img.hasAttribute('aria-labelledby')) return false;
    const alt = img.getAttribute('alt');
    return alt === null || D.looksLikeFilename(D.clean(alt));
  };

  /** Visible text of an element: text nodes only, skipping hidden and fallback markup. */
  const textOf = (el) => {
    if (!el) return '';
    let out = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(NO_TEXT) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n && out.length < 1000; n = walker.nextNode()) {
      if (n.nodeType === 3) out += ' ' + n.nodeValue;
    }
    return D.clean(out);
  };

  /** Nearest wrapper's short text (a news card headline in a plain div), up to 5 levels up. */
  const cardText = (img) => {
    let el = img.parentElement;
    for (let i = 0; i < 5 && el && el !== document.body; i++, el = el.parentElement) {
      if (el.querySelector('input, textarea, select, [contenteditable]')) return '';
      const text = textOf(el);
      if (text.length > CARD_TEXT_MAX) return '';
      if (text.length >= 10) return text;
    }
    return '';
  };

  /**
   * Up to 300 characters of nearby text: title, caption, card heading or short card text, and
   * the enclosing section's heading. Never form values, hidden or <noscript> markup, the page
   * title, e-mail addresses, phone numbers or URLs.
   */
  const contextFor = (img) => {
    const parts = [];
    const add = (text) => {
      const t = D.clean(text);
      if (!t || EMAIL.test(t) || URLISH.test(t) || PHONE.test(t)) return;
      if (!parts.some((p) => p.includes(t) || t.includes(p))) parts.push(t);
    };
    add(img.getAttribute('title'));
    add(textOf(img.closest('figure')?.querySelector('figcaption')));
    const card = img.closest('article, li, figure, section');
    add(textOf(card?.querySelector('h1, h2, h3, h4')));
    if (!parts.length) add(cardText(img));
    const area = img.closest('main, article, section'); // not the whole page
    add(textOf(area?.querySelector('h1, h2, h3')));
    return parts.join('. ').slice(0, MAX_CONTEXT);
  };
  D.aiContextFor = contextFor; // read-only helper for backend/scripts/eval-alt.mjs

  const schedule = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  };

  const enqueue = (img) => {
    if (asked.has(img) || queue.includes(img)) return;
    queue.push(img);
    if (queue.length >= MAX_BATCH) schedule(0);
    else if (!timer) schedule(DEBOUNCE_MS);
  };

  const watch = (img) => {
    if (observer && !asked.has(img)) observer.observe(img);
  };

  /** Not loaded yet, or a placeholder (lazy loading): retry once when it loads. */
  const retryOnLoad = (img) => {
    if (retried.has(img) || waitingLoad.has(img)) {
      asked.add(img);
      return;
    }
    retried.add(img);
    const gen = generation;
    const onLoad = () => {
      waitingLoad.delete(img);
      if (gen === generation) enqueue(img);
    };
    waitingLoad.set(img, onLoad);
    img.addEventListener('load', onLoad, { once: true });
  };

  /**
   * After we describe an image, withdraw the description if the site shows a different picture
   * in the same <img> (galleries, carousels, recycled feed items): flag it again and re-ask.
   */
  const followChanges = (img, url) => {
    const gen = generation;
    const onChange = () => {
      if (gen !== generation || srcOf(img) === url) return;
      img.removeEventListener('load', onChange);
      img.removeEventListener('error', onChange);
      described.delete(img);
      if (!(img.getAttribute('alt') || '').startsWith(PREFIX) && img.getAttribute('alt') !== '') return; // site's own alt now
      D.changes.removeAttr(img, 'alt');
      D.changes.setAttr(img, FLAG, 'alt');
      asked.delete(img);
      retried.delete(img);
      watch(img);
    };
    described.set(img, { url, onChange });
    img.addEventListener('load', onChange);
    img.addEventListener('error', onChange);
  };

  async function flush() {
    timer = null;
    const gen = generation;
    const batch = queue.splice(0, MAX_BATCH);
    if (queue.length) schedule(DEBOUNCE_MS);
    if (!batch.length) return;

    // Page gate, checked again right before sending (the page may have changed).
    if (!D.privacy.mayShareFrom(location.href, settings) || D.privacy.pageLooksPrivate(document)) {
      batch.forEach((img) => asked.add(img));
      return;
    }

    const sent = [];
    for (const img of batch) {
      if (!stillWanted(img) || offLimits(img)) {
        asked.add(img);
        continue;
      }
      if (!loaded(img)) {
        retryOnLoad(img); // lazy image still loading
        continue;
      }
      const url = srcOf(img);
      if (!D.privacy.mayShareUrl(url, settings)) {
        retryOnLoad(img); // a placeholder (data:) until the real image loads
        continue;
      }
      if (tooSmall(img)) {
        asked.add(img);
        continue;
      }
      asked.add(img);
      sent.push({ img, url, context: contextFor(img) });
    }
    if (!sent.length) return;

    // No background (tests) or extension reloaded: no descriptions.
    const response = await Promise.resolve()
      .then(() => chrome.runtime.sendMessage({
        type: 'dostupno:describe',
        items: sent.map(({ url, context }) => ({ imageUrl: url, context })),
      }))
      .catch(() => null);
    if (gen !== generation) return; // turned off meanwhile: touch nothing

    const results = Array.isArray(response?.results) ? response.results : [];
    sent.forEach(({ img, url }, i) => {
      const r = results[i];
      if (!r || typeof r.alt !== 'string') return;
      if (!stillWanted(img) || srcOf(img) !== url) return; // the site changed it meanwhile
      const alt = r.decorative === true ? '' : D.clean(r.alt);
      if (r.decorative !== true && (!alt || alt.length > MAX_ALT)) return;
      D.changes.setAttr(img, 'alt', alt ? PREFIX + alt : '');
      D.changes.removeAttr(img, FLAG);
      followChanges(img, url);
    });
  }

  D.registerFixer({
    id: 'ai-images',
    profiles: ['screenreader'],
    run(root, ctx) {
      settings = ctx.settings;
      if (!settings || settings.ai !== true) return;
      if (!D.privacy?.mayShareFrom(location.href, settings)) return;
      if (!observer) {
        const gen = generation;
        observer = new IntersectionObserver((entries, own) => {
          if (gen !== generation) return own.disconnect(); // delivered after stop()
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            own.unobserve(entry.target);
            enqueue(entry.target);
          }
        }, { rootMargin: '100% 0px' }); // about a screen ahead
      }
      for (const img of D.queryAll(root, `img[${FLAG}="alt"]`)) watch(img);
    },
    stop() {
      generation++;
      observer?.disconnect();
      observer = null;
      clearTimeout(timer);
      timer = null;
      queue = [];
      for (const [img, onLoad] of waitingLoad) img.removeEventListener('load', onLoad);
      waitingLoad.clear();
      for (const [img, { onChange }] of described) {
        img.removeEventListener('load', onChange);
        img.removeEventListener('error', onChange);
      }
      described.clear();
      asked = new WeakSet();
      retried = new WeakSet();
      settings = null;
    },
  });
})();
