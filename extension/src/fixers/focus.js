/**
 * Fixer: visible keyboard focus (low-vision profile).
 * Many sites remove the focus outline. A two-tone ring (dark + light) stays
 * visible on any background.
 */
(() => {
  const D = window.Dostupno;

  const CSS = `
    :focus-visible {
      outline: 3px solid #0b0b0b !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px #ffd400 !important;
      border-radius: 2px;
    }
  `;

  D.registerFixer({
    id: 'focus',
    profiles: ['lowvision'],
    run(root, ctx) {
      if (ctx.initial) D.changes.addStyle('dostupno-focus', CSS);
    },
  });
})();
