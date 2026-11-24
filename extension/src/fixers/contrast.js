/**
 * Fixer: low text contrast (low-vision profile only).
 * WCAG AA: 4.5:1 for normal text, 3:1 for large text (>= 24px, or >= 18.66px bold).
 * We nudge the text color toward black or white just enough to pass,
 * so the site keeps its look as much as possible.
 */
(() => {
  const D = window.Dostupno;

  const parseColor = (str) => {
    const m = str && str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
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

  /** Effective background behind el. Returns null if an image/gradient is involved (can't know). */
  const effectiveBackground = (el) => {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 }; // browser default canvas
    for (let i = layers.length - 1; i >= 0; i--) result = blend(layers[i], result);
    return result;
  };

  const mix = (c, target, t) => ({
    r: Math.round(c.r + (target.r - c.r) * t),
    g: Math.round(c.g + (target.g - c.g) * t),
    b: Math.round(c.b + (target.b - c.b) * t),
    a: 1,
  });

  /** Smallest shift toward black or white that reaches the target ratio. */
  D.fixColor = (fg, bg, target) => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const towards = D.contrastRatio(black, bg) >= D.contrastRatio(white, bg) ? black : white;
    if (D.contrastRatio(towards, bg) < target) return towards; // best possible
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (D.contrastRatio(mix(fg, towards, mid), bg) >= target) hi = mid;
      else lo = mid;
    }
    return mix(fg, towards, hi);
  };

  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());

  D.registerFixer({
    id: 'contrast',
    profiles: ['lowvision'],
    run(root) {
      const candidates = D.queryAll(root, 'body *:not(script):not(style):not(svg):not(svg *)');
      for (const el of candidates) {
        if (!hasOwnText(el)) continue;
        if (!D.once(el, 'contrast')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;

        const fgRaw = parseColor(cs.color);
        const bg = effectiveBackground(el);
        if (!fgRaw || !bg) continue;
        const fg = fgRaw.a < 1 ? blend(fgRaw, bg) : fgRaw;

        const size = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const target = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;

        if (D.contrastRatio(fg, bg) >= target) continue;
        const fixed = D.fixColor(fg, bg, target + 0.1); // tiny margin for rounding
        D.changes.setStyle(el, 'color', `rgb(${fixed.r}, ${fixed.g}, ${fixed.b})`);
      }
    },
  });
})();
