/**
 * Fixer: images without alt text.
 * Weekend 1 handles only what we can decide without AI:
 *  - decorative images (tiny, spacers, inside a link that already has text) -> alt=""
 *  - images with a <figcaption> or title -> use that text
 * Everything else is marked data-dostupno-needs-ai="alt" for the backend (weekend 2).
 */
(() => {
  const D = window.Dostupno;

  const looksLikeFilename = (alt) =>
    /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(alt) || /^(img|image|photo|dsc|фото)[\s_-]?\d*$/i.test(alt);

  D.registerFixer({
    id: 'images',
    profiles: ['all'],
    run(root) {
      for (const img of D.queryAll(root, 'img')) {
        if (!D.once(img, 'images')) continue;
        if (img.closest('[aria-hidden="true"]')) continue;
        const role = img.getAttribute('role');
        if (role === 'presentation' || role === 'none') continue;

        const alt = img.getAttribute('alt');
        if (alt !== null && !looksLikeFilename(D.clean(alt))) continue; // has a real alt (or alt="")

        // Decorative: tiny images (spacers, tracking pixels, bullets).
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (img.complete && w > 0 && h > 0 && (w <= 24 || h <= 24)) {
          D.changes.setAttr(img, 'alt', '');
          continue;
        }

        // Inside a link or button that already has text: the image is redundant.
        const parent = img.closest('a, button');
        if (parent) {
          const parentText = D.clean(parent.textContent);
          if (parentText) {
            D.changes.setAttr(img, 'alt', '');
            continue;
          }
        }

        // A caption or title describes it.
        const caption = img.closest('figure')?.querySelector('figcaption');
        const text = D.clean(caption?.textContent) || D.clean(img.getAttribute('title'));
        if (text) {
          D.changes.setAttr(img, 'alt', text.slice(0, 200));
          continue;
        }

        // Needs AI (weekend 2). Until then, leave it alone rather than guess.
        img.setAttribute('data-dostupno-needs-ai', 'alt');
      }
    },
  });
})();
