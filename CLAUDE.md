# Доступно — project context for Claude Code

## What this is
A browser extension (plus, later, a small backend) that makes **any website** more usable
for people with disabilities, automatically, on the page they're already on.
Users install it once, pick what helps them, and every site gets better. No reports,
no code, no separate app. Ukrainian-first: Ukrainian UI, Ukrainian alt text and labels.

Users are **people with disabilities, not developers**:
- Screen reader users (NVDA/JAWS on Windows, TalkBack on Android, VoiceOver on iOS/Mac)
- People with low vision

## Principles (do not break these)
1. **Never make a page worse.** When unsure, do nothing. A wrong label is worse than none.
2. **Never override what the site already did right.** Only fill in what's missing or broken.
3. **Everything is reversible.** All DOM changes go through `Dostupno.changes`
   (`setAttr`, `setStyle`, `addStyle`) so `revertAll()` can undo them instantly.
   Never modify the DOM directly in a fixer.
4. **Silent by default.** No popups or announcements about fixes. Only on/off toggles are announced.
5. **The extension's own UI must be fully accessible**: keyboard, screen reader, high contrast, 200% zoom.
6. **Privacy.** Never send page content to any server from private pages (banking, Diia, email, medical).
   AI requests (weekend 2+) send only public image URLs or minimal context, and users can exclude sites.
7. **Performance.** Fixers must stay fast on big pages. Process new subtrees only (MutationObserver), never re-scan everything.
8. **A failing fixer must never break the page** (content.js wraps each fixer in try/catch; keep it that way).

## Architecture
```
extension/
  manifest.json          MV3. Content scripts are plain scripts (not modules), loaded in order.
  src/core.js            window.Dostupno namespace: change log + revert, accessibleName(), helpers.
  src/fixers/*.js        One file per problem. Each calls Dostupno.registerFixer({ id, profiles, run(root, ctx) }).
  src/content.js         Loads settings, runs fixers, watches DOM changes, reverts on toggle off.
  src/background.js      Keyboard shortcut (Alt+Shift+D) toggles the current site; opens welcome page on install.
  popup/                 Popup + welcome page (same file, ?welcome=1).
  icons/                 icon.svg (source) + PNGs rendered by `npm run icons`.
backend/                 Not built yet. See backend/README.md for the planned API.
test/fixtures/           Pages with known accessibility problems.
test/run-fixers.mjs      Smoke test: injects content scripts into the fixture with Playwright.
test/audit-sites.mjs     Real-site audit: records every change on the sites in test/sites.txt.
scripts/make-icons.mjs   Renders extension/icons/icon.svg to 16/32/48/128 PNGs.
```

### Fixer contract
```js
Dostupno.registerFixer({
  id: 'unique-id',
  profiles: ['all'],          // 'all' | 'screenreader' | 'lowvision'
  run(root, ctx) {            // root = document.body on first run, then each added subtree
    // ctx.initial: true on the first run for the page
    // Use Dostupno.queryAll(root, selector) (includes root itself)
    // Use Dostupno.once(el, id) to skip elements already handled
    // Change things ONLY via Dostupno.changes.*
  },
  stop() {},                  // optional: disconnect observers/timers. Called on toggle off,
                              // before revertAll(); nothing may touch the page after it.
});
```
Add new fixer files to `manifest.json` `content_scripts.js`, **before** `src/content.js`.

### Settings (chrome.storage.sync)
```js
{ enabled: true, profiles: { screenreader: true, lowvision: false }, disabledSites: ['example.com'] }
```

### Elements that need AI
Fixers mark what they can't solve with `data-dostupno-needs-ai="alt" | "name" | "label"`.
The backend (weekend 2) will fill these in. `revertAll()` removes these markers too.

## Current fixers (weekend 1, no AI)
- `lang`: sets `<html lang>` when missing (detects uk/ru/en by unique letters).
- `images`: decorative images → `alt=""`; figcaption/title → alt; filenames as alt get flagged for AI.
- `names`: icon-only buttons/links get Ukrainian names from title, symbols, a text link to the same
  URL (card headline), href domain, icon class names. "close-search" → "Закрити пошук", not "Пошук".
- `forms`: unlabeled fields get aria-label from placeholder (unless it's an example like
  `name@mail.com` or a mask like `+38 (0__)`), title, nearby text, or name/id/type.
- `contrast` (lowvision): reaches WCAG AA (4.5:1 / 3:1 large) with the smallest change.
  Only checks text on screen (IntersectionObserver), reads the real background via
  `elementsFromPoint`, keeps polarity (light text never becomes dark; if white isn't enough,
  a small button/badge background is darkened instead). Skips hidden/sr-only text, anything over
  images/gradients/filters, mid-transition colors, and ratios < 1.5:1 (background guess is wrong).
- `focus` (lowvision): two-tone focus ring visible on any background.

## Commands
- `npm install` then `npx playwright install chromium` (first time)
- `npm test`: smoke test against `test/fixtures/broken.html`
- `npm run audit`: run all fixers on the real sites in `test/sites.txt`; writes
  `test/audit-report/<host>.json` (every change with context) and `summary.md`.
  `npm run audit -- https://site.ua/` for specific URLs; `SHOTS=1` adds before/after
  pictures of contrast fixes. Run it after changing a fixer and review new changes for false positives.
- `npm run icons`: re-render the PNG icons after editing `extension/icons/icon.svg`
- Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/`
- Load in Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `extension/manifest.json`

## Conventions
- Plain JavaScript, no build step for now (keeps "Load unpacked" instant). Consider TypeScript + esbuild later.
- User-facing text is Ukrainian. Code, comments and commit messages in English.
- When adding a fixer, add a broken example to `test/fixtures/broken.html` and a check to `test/run-fixers.mjs`.
  When a real-site audit finds a false positive, add it to the fixture as a "must stay untouched" check.
- Test real changes with a screen reader (NVDA is free on Windows; VoiceOver on Mac) before calling them done.

## Roadmap
See `docs/ROADMAP.md`.

## Known limitations
- `accessibleName()` is a simplified accname algorithm, good for "has a name or not", not exact.
- Contrast fixer skips text over background images/gradients (can't know the real background).
- Shadow DOM and iframes are not handled yet.
- Chrome on Android has no extensions; mobile support means Firefox for Android and Safari on iOS.
