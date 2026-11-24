/**
 * Fixer: form fields without a label.
 * A screen reader user hears only "edit text" and has no idea what to type.
 * Sources, best first: placeholder, title, nearby preceding text, name attribute.
 */
(() => {
  const D = window.Dostupno;

  const NAME_HINTS = [
    [/e-?mail|пошт/i, 'Електронна пошта'],
    [/phone|tel|телефон/i, 'Телефон'],
    [/^(q|s|search|query|keyword)s?$/i, 'Пошук'],
    [/pass(word)?|пароль/i, 'Пароль'],
    [/first.?name|^name$|ім.?я/i, "Ім'я"],
    [/last.?name|surname|прізвище/i, 'Прізвище'],
    [/city|місто/i, 'Місто'],
    [/address|адрес/i, 'Адреса'],
    [/comment|message|повідомлення/i, 'Повідомлення'],
  ];

  /** Short text right before the field (same parent or previous sibling). */
  const nearbyText = (el) => {
    let node = el.previousSibling;
    for (let i = 0; node && i < 3; i++, node = node.previousSibling) {
      // Another field in between means the text belongs to that field, not this one.
      if (node.nodeType === 1 && node.matches('input, select, textarea, button, br, p, div')) return null;
      const t = D.clean(node.textContent);
      if (t) return t.length <= 60 ? t : null;
    }
    // Field wrapped alone in a container, with the label text in the previous container.
    const parent = el.parentElement;
    if (!parent || parent.querySelectorAll('input, select, textarea').length > 1) return null;
    const t = D.clean(parent.previousElementSibling?.textContent);
    return t && t.length <= 60 ? t : null;
  };

  D.registerFixer({
    id: 'forms',
    profiles: ['all'],
    run(root) {
      const selector =
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"]), select, textarea';
      for (const el of D.queryAll(root, selector)) {
        if (!D.once(el, 'forms')) continue;
        if (D.isHidden(el)) continue;
        if (D.accessibleName(el)) continue;

        let name =
          D.clean(el.getAttribute('placeholder')) || D.clean(el.getAttribute('title')) || nearbyText(el);

        if (!name) {
          const attr = (el.getAttribute('name') || '') + ' ' + (el.id || '') + ' ' + (el.type || '');
          for (const [re, label] of NAME_HINTS) if (re.test(attr.trim()) || re.test(el.type)) { name = label; break; }
        }

        if (name) D.changes.setAttr(el, 'aria-label', name.replace(/[:*]\s*$/, '').trim());
        else el.setAttribute('data-dostupno-needs-ai', 'label');
      }
    },
  });
})();
