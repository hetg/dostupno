/**
 * Fixer: buttons and links without a name.
 * Icon-only controls ("🔍", "☰", a cart icon) are announced as just "button"
 * or as a long URL. We guess a name from title, icon class names, href, and
 * common symbols, in Ukrainian.
 */
(() => {
  const D = window.Dostupno;

  // Order matters: first match wins. Patterns are tested against class names,
  // id, data-icon, and inner svg <use href>.
  const ICON_HINTS = [
    [/search|magnif|lupa|poshuk/i, 'Пошук'],
    [/burger|hamburger|menu|nav-?toggle|bars/i, 'Меню'],
    [/close|cross|dismiss|times/i, 'Закрити'],
    [/cart|basket|bag|koshyk/i, 'Кошик'],
    [/wish|heart|favou?rite/i, 'Обране'],
    [/user|account|profile|login|sign-?in|avatar/i, 'Особистий кабінет'],
    [/phone|call|tel/i, 'Зателефонувати'],
    [/mail|envelope|email/i, 'Написати листа'],
    [/arrow-?up|to-?top|scroll-?top|back-?to-?top/i, 'Нагору'],
    [/(arrow|chevron|angle)-?(left|prev)|prev(ious)?\b/i, 'Попередній'],
    [/(arrow|chevron|angle)-?(right|next)|next\b/i, 'Наступний'],
    [/play/i, 'Відтворити'],
    [/pause/i, 'Пауза'],
    [/share/i, 'Поділитися'],
    [/print/i, 'Друкувати'],
    [/download/i, 'Завантажити'],
    [/filter/i, 'Фільтри'],
    [/settings|gear|cog/i, 'Налаштування'],
    [/lang|globe/i, 'Мова'],
    [/facebook|\bfb\b/i, 'Facebook'],
    [/instagram|\binsta\b/i, 'Instagram'],
    [/telegram|\btg\b/i, 'Telegram'],
    [/youtube/i, 'YouTube'],
    [/twitter|\bx-?icon/i, 'X (Twitter)'],
    [/linkedin/i, 'LinkedIn'],
    [/viber/i, 'Viber'],
    [/tiktok/i, 'TikTok'],
  ];

  const SYMBOLS = {
    '🔍': 'Пошук', '🔎': 'Пошук', '☰': 'Меню', '≡': 'Меню', '×': 'Закрити', '✕': 'Закрити',
    '✖': 'Закрити', '❌': 'Закрити', '←': 'Назад', '→': 'Далі', '‹': 'Попередній', '›': 'Наступний',
    '«': 'Попередній', '»': 'Наступний', '▶': 'Відтворити', '⏸': 'Пауза', '♥': 'Обране', '❤': 'Обране',
    '🛒': 'Кошик', '↑': 'Нагору', '⬆': 'Нагору',
  };

  const DOMAINS = [
    [/youtube\.com\/(watch|shorts)|youtu\.be\//, 'Відео на YouTube'],
    [/facebook\.com/, 'Facebook'], [/instagram\.com/, 'Instagram'], [/t\.me|telegram\./, 'Telegram'],
    [/youtube\.com|youtu\.be/, 'YouTube'], [/twitter\.com|x\.com/, 'X (Twitter)'],
    [/linkedin\.com/, 'LinkedIn'], [/tiktok\.com/, 'TikTok'], [/viber\./, 'Viber'],
  ];

  const hintText = (el) => {
    const parts = [el.className?.baseVal ?? el.className, el.id, el.getAttribute('data-icon')];
    el.querySelectorAll('*').forEach((c) => {
      parts.push(c.className?.baseVal ?? c.className, c.getAttribute('data-icon'));
      if (c.tagName.toLowerCase() === 'use') parts.push(c.getAttribute('href') || c.getAttribute('xlink:href'));
    });
    return parts.filter((p) => typeof p === 'string').join(' ');
  };

  const hasWords = (s) => /[\p{L}\p{N}]/u.test(s);

  /**
   * Cards often have an icon/image link and a text link to the same page.
   * The text link's name is the best name for the icon link.
   */
  const sameTargetName = (el) => {
    if (el.tagName !== 'A') return null;
    const href = el.getAttribute('href');
    if (!href || href === '#' || href === '/' || /^(javascript|tel|mailto):/i.test(href)) return null;
    let best = null;
    for (const other of document.querySelectorAll(`a[href="${CSS.escape(href)}"]`)) {
      if (other === el || D.isHidden(other)) continue;
      const t = D.accessibleName(other).replace(/[\s,;:–—-]+$/, '');
      if (!t || !hasWords(t) || t.length > 150) continue;
      if (other.closest('h1, h2, h3, h4, h5, h6')) return t; // a headline beats anything
      best = best || t;
    }
    return best;
  };

  D.guessName = (el) => {
    const title = D.clean(el.getAttribute('title'));
    if (title) return title;

    const raw = (el.textContent || '').trim();
    if (raw && SYMBOLS[raw]) return SYMBOLS[raw];

    const href = el.getAttribute('href') || '';
    if (href.startsWith('tel:')) return 'Зателефонувати ' + href.slice(4);
    if (href.startsWith('mailto:')) return 'Написати на ' + href.slice(7).split('?')[0];
    const target = sameTargetName(el);
    if (target) return /play|video|відео/i.test(hintText(el)) ? `Відео: ${target}` : target;

    for (const [re, name] of DOMAINS) if (re.test(href)) return name;

    // Submit button inside a search form.
    const form = el.closest('form');
    if (form && /search|poshuk|q=|пошук/i.test(form.action + ' ' + form.className + ' ' + form.getAttribute('role'))) {
      if (el.type === 'submit' || el.tagName === 'BUTTON') return 'Шукати';
    }

    const hints = hintText(el);
    // "close-search", "menu-close": closing something, not opening it.
    if (/close|cross|dismiss|times/i.test(hints)) {
      if (/search|magnif|lupa|poshuk/i.test(hints)) return 'Закрити пошук';
      if (/burger|menu|nav/i.test(hints)) return 'Закрити меню';
      return 'Закрити';
    }
    for (const [re, name] of ICON_HINTS) if (re.test(hints)) return name;

    if (el.tagName === 'A') {
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '')) return 'Головна сторінка';
      } catch (_) {}
    }
    return null;
  };

  D.registerFixer({
    id: 'names',
    profiles: ['all'],
    run(root) {
      const selector = 'a[href], button, [role="button"], [role="link"], input[type="submit"], input[type="button"], input[type="image"]';
      for (const el of D.queryAll(root, selector)) {
        if (!D.once(el, 'names')) continue;
        if (D.isHidden(el)) continue;
        // A name made only of symbols ("×", "☰", "→") is not a real name.
        const current = D.accessibleName(el);
        if (current && hasWords(current)) continue;

        if (el.tagName === 'INPUT' && el.type === 'image') {
          const name = D.guessName(el) || (el.closest('form') ? 'Надіслати' : null);
          if (name) D.changes.setAttr(el, 'alt', name);
          continue;
        }

        const name = D.guessName(el);
        if (name) {
          D.changes.setAttr(el, 'aria-label', name);
          D.log('named', el, '→', name);
        } else {
          el.setAttribute('data-dostupno-needs-ai', 'name');
        }
      }
    },
  });
})();
