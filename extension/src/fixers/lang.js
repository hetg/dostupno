/**
 * Fixer: page language.
 * Screen readers pick the voice from <html lang>. Without it, Ukrainian text is
 * often read with an English or Russian voice and becomes unintelligible.
 * We only fill it in when missing; we never override what the site set.
 */
(() => {
  const D = window.Dostupno;

  /** Guess language from letters unique to each alphabet. */
  D.detectLang = (text) => {
    const sample = text.slice(0, 20000).toLowerCase();
    const count = (re) => (sample.match(re) || []).length;
    const uk = count(/[іїєґ]/g);
    const ru = count(/[ыэъё]/g);
    const cyr = count(/[а-яіїєґё]/g);
    const lat = count(/[a-z]/g);
    if (cyr > lat) {
      if (uk >= ru) return uk > 0 ? 'uk' : null; // generic Cyrillic: don't guess
      return 'ru';
    }
    if (lat > 50) return 'en';
    return null;
  };

  D.registerFixer({
    id: 'lang',
    profiles: ['all'],
    run(root, ctx) {
      if (!ctx.initial) return;
      const html = document.documentElement;
      if (D.clean(html.getAttribute('lang'))) return;
      const lang = D.detectLang(document.body ? document.body.innerText : '');
      if (lang) {
        D.changes.setAttr(html, 'lang', lang);
        D.log('lang set to', lang);
      }
    },
  });
})();
