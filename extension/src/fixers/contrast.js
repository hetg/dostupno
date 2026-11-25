/**
 * Fixer: low text contrast (low-vision profile only).
 * WCAG AA: 4.5:1 for normal text, 3:1 for large text (>= 24px, or >= 18.66px bold).
 *
 * Rules, all aimed at "never make the page worse":
 *  - Only text that is actually on screen is checked (IntersectionObserver).
 *    The real background is read from what is painted under the text
 *    (elementsFromPoint), not just from ancestors, so overlays, positioned
 *    images and pseudo-element backgrounds are noticed and the text is skipped.
 *  - The design's polarity is kept: dark text gets darker, light text gets lighter.
 *    Light text that can't reach the target even as pure white (white on a
 *    mid-green button) keeps its color and the small element behind it gets a
 *    slightly darker background instead.
 *  - Anything doubtful is left alone: hidden or screen-reader-only text,
 *    images/gradients/filters underneath, running transitions, and ratios so
 *    low (< 1.5:1) that the text would be invisible, which means our idea of the
 *    background is wrong, not that the site ships invisible text.
 */
(() => {
  const D = window.Dostupno;

  const parseColor = (str) => {
    const m = str && str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };

  const luminance = ({ r, g, b }) => {
    const ch = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };

  D.contrastRatio = (c1, c2) => {
    const [l1, l2] = [luminance(c1), luminance(c2)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  const blend = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });

  const mix = (c, target, t) => ({
    r: Math.round(c.r + (target.r - c.r) * t),
    g: Math.round(c.g + (target.g - c.g) * t),
    b: Math.round(c.b + (target.b - c.b) * t),
    a: 1,
  });

  const BLACK = { r: 0, g: 0, b: 0, a: 1 };
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };
  const rgb = (c) => `rgb(${c.r}, ${c.g}, ${c.b})`;

  /**
   * Smallest move of `moving` toward `towards` so that it reaches `target`
   * against `fixed`. Returns null if even the endpoint isn't enough.
   */
  const shift = (moving, fixed, towards, target) => {
    if (D.contrastRatio(towards, fixed) < target) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (D.contrastRatio(mix(moving, towards, mid), fixed) >= target) hi = mid;
      else lo = mid;
    }
    return mix(moving, towards, hi);
  };

  /** Kept for other code/tests: polarity-preserving text color fix, or null. */
  D.fixColor = (fg, bg, target) =>
    shift(fg, bg, luminance(fg) > luminance(bg) ? WHITE : BLACK, target);

  const MEDIA = new Set(['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'OBJECT', 'EMBED', 'svg', 'SVG']);
  const hasPaint = (cs) => (parseColor(cs.backgroundColor)?.a || 0) > 0 || cs.backgroundImage !== 'none';
  const positionedPseudoPaint = (node) =>
    ['::before', '::after'].some((p) => {
      const cs = getComputedStyle(node, p);
      return cs.content !== 'none' && (cs.position === 'absolute' || cs.position === 'fixed') && hasPaint(cs);
    });
  const isAnimating = (node) =>
    typeof node.getAnimations === 'function' && node.getAnimations().some((a) => a.playState === 'running');

  /**
   * What is painted under the point (x, y) where el's text is.
   * Returns { color, owner, animating } or null when it can't be known.
   * owner = the single element whose opaque background is the whole answer.
   */
  const backgroundAt = (el, x, y) => {
    const stack = document.elementsFromPoint(x, y);
    const idx = stack.indexOf(el);
    if (idx < 0) return null; // something else is on top of the text here
    // Anything painted above the text (an overlay with a background) hides it.
    for (let i = 0; i < idx; i++) if (hasPaint(getComputedStyle(stack[i]))) return null;

    const layers = [];
    let animating = false;
    for (let i = idx; i < stack.length; i++) {
      const node = stack[i];
      if (MEDIA.has(node.tagName)) return null;
      const cs = getComputedStyle(node);
      if (cs.backgroundImage !== 'none') return null;
      if (cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.backdropFilter && cs.backdropFilter !== 'none') return null;
      if (positionedPseudoPaint(node)) return null;
      if (isAnimating(node)) animating = true;
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push({ c, node });
        if (c.a >= 1) break;
      }
    }
    let color = WHITE; // browser default canvas
    for (let i = layers.length - 1; i >= 0; i--) color = blend(layers[i].c, color);
    const top = layers[layers.length - 1];
    const owner = layers.length === 1 && top.c.a >= 1 ? top.node : null;
    return { color, owner, animating };
  };

  const ownTextNode = (el) =>
    [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());

  /** Center of the first line of el's own text that is inside the viewport. */
  const textPoint = (el) => {
    const node = ownTextNode(el);
    if (!node) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const vw = innerWidth, vh = innerHeight;
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x >= 0 && y >= 0 && x < vw && y < vh) return { x, y };
    }
    return null;
  };

  const visible = (el) => {
    if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    return !D.isHidden(el);
  };

  /**
   * May we darken owner's background? Only a small box (button, badge, tile)
   * whose own text is all lighter than the background, so no other text in it
   * gets worse.
   */
  const canDarkenBackground = (owner, bg) => {
    if (owner === document.body || owner === document.documentElement) return false;
    const r = owner.getBoundingClientRect();
    if (r.width * r.height > 400 * 300) return false;
    const bgLum = luminance(bg);
    const texts = [owner, ...owner.querySelectorAll('*')].filter(ownTextNode).slice(0, 30);
    return texts.every((t) => {
      const c = parseColor(getComputedStyle(t).color);
      return c && luminance(c) > bgLum;
    });
  };

  const MAX_RETRIES = 3;

  /** Returns true when el is settled (fixed or deliberately skipped). */
  const check = (el, retries = 0) => {
    if (!el.isConnected || !visible(el)) return true;
    const box = el.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) return true; // screen-reader-only text
    const point = textPoint(el);
    if (!point) return false; // not on screen yet; wait for more of it to scroll in

    const cs = getComputedStyle(el);
    const fgRaw = parseColor(cs.color);
    const under = backgroundAt(el, point.x, point.y);
    if (!fgRaw || !under) return true;
    if (under.animating || isAnimating(el)) {
      // Mid-transition colors are not the real ones. Look again shortly.
      // `observer` is null once the fixer is stopped: never change a reverted page.
      if (retries < MAX_RETRIES) setTimeout(() => observer && check(el, retries + 1), 400);
      return true;
    }
    const bg = under.color;
    const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;

    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const target = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;

    const ratio = D.contrastRatio(fg, bg);
    if (ratio >= target) return true;
    if (ratio < 1.5) return true; // we must be wrong about the background

    const want = target + 0.1; // tiny margin for rounding
    const light = luminance(fg) > luminance(bg);
    const fixed = shift(fg, bg, light ? WHITE : BLACK, want);
    if (fixed) {
      D.changes.setStyle(el, 'color', rgb(fixed));
      return true;
    }
    // Light text that can't get light enough: darken the small box behind it.
    if (light && under.owner && D.once(under.owner, 'contrast-bg') && canDarkenBackground(under.owner, bg)) {
      const darker = shift(bg, fg, BLACK, want);
      if (darker) D.changes.setStyle(under.owner, 'background-color', rgb(darker));
    }
    return true;
  };

  let observer = null;
  const getObserver = () =>
    observer ||
    (observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          let done = true;
          try {
            done = check(e.target);
          } catch (err) {
            console.warn('[Доступно] contrast check failed:', err);
          }
          if (done) observer?.unobserve(e.target);
        }
      },
      { threshold: [0, 0.5, 1] }
    ));

  const hasOwnText = (el) => !!ownTextNode(el);

  D.registerFixer({
    id: 'contrast',
    profiles: ['lowvision'],
    run(root) {
      const candidates = D.queryAll(root, 'body *:not(script):not(style):not(noscript):not(svg):not(svg *)');
      for (const el of candidates) {
        if (!hasOwnText(el)) continue;
        if (!D.once(el, 'contrast')) continue;
        getObserver().observe(el);
      }
    },
    stop() {
      observer?.disconnect();
      observer = null;
    },
  });
})();
