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
  src/content.js         Loads settings, runs fixers, watches DOM changes, reverts on toggle off;
                         reports on/off to the background (`dostupno:state`) for the toolbar icon, also after
                         back/forward-cache restores and prerender activation.
  src/early-state.js     document_start content script (2nd manifest entry): reports on/off for the toolbar
                         icon while the page loads. Touches nothing. Test/audit harnesses don't inject it.
  src/background.js      Keyboard shortcut (Alt+Shift+D) toggles the current site; opens welcome page on install;
                         sets each tab's toolbar icon + tooltip from the pages' reports (the browser resets
                         them to the default on navigation, which covers pages where Доступно can't run).
  popup/                 Popup + welcome page (same file, ?welcome=1).
  icons/                 icon.svg (on) and icon-off.svg (off on this site: grey, crossed out) + PNGs
                         rendered by `npm run icons`.
backend/                 Not built yet. See backend/README.md for the planned API.
test/fixtures/           Pages with known accessibility problems.
test/run-fixers.mjs      Smoke test: injects content scripts into the fixture; names checked via
                         Chromium's accessibility tree (what screen readers get).
test/e2e-extension.mjs   Loads the real unpacked extension in Chromium and checks it end to end.
test/audit-sites.mjs     Real-site audit: records every change on the sites in test/sites.txt.
scripts/make-icons.mjs   Renders extension/icons/icon.svg to 16/32/48/128 PNGs.
eslint-rules/            Custom lint rule: fixers may change the DOM only via Dostupno.changes.
openspec/                Specs (source of truth for behavior) and change proposals.
.claude/                 Project settings, hooks, subagents, skills (see "Working with agents").
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
Profile in brackets: `all` always runs; `screenreader` and `lowvision` follow the popup choices
"Я користуюсь скрінрідером" (on by default) and "Я погано бачу".
- `lang` (all): sets `<html lang>` when missing (detects uk/ru/en by unique letters).
- `images` (screenreader): decorative images → `alt=""`; figcaption/title → alt; filenames as alt get flagged for AI.
- `names` (screenreader): icon-only buttons/links get Ukrainian names from title, symbols, a text link to the same
  URL (card headline), href domain, icon class names. "close-search" → "Закрити пошук", not "Пошук".
- `forms` (screenreader): unlabeled fields get aria-label from placeholder (unless it's an example like
  `name@mail.com` or a mask like `+38 (0__)`), title, nearby text, or name/id/type.
- `contrast` (lowvision): reaches WCAG AA (4.5:1 / 3:1 large) with the smallest change.
  Only checks text on screen (IntersectionObserver), reads the real background via
  `elementsFromPoint`, keeps polarity (light text never becomes dark; if white isn't enough,
  a small button/badge background is darkened instead). Skips hidden/sr-only text, anything over
  images/gradients/filters, mid-transition colors, and ratios < 1.5:1 (background guess is wrong).
- `focus` (lowvision): two-tone focus ring visible on any background.

## Commands
- `npm ci` then `npx playwright install chromium` (first time; the SessionStart hook does this)
- `npm run check`: everything CI runs (lint, smoke test, e2e, OpenSpec validation). Run before a PR.
- `npm test`: smoke test against `test/fixtures/broken.html`
- `npm run test:e2e`: real unpacked extension in Chromium (`SHOTS=1` saves a popup screenshot)
- `npm run lint`: ESLint (incl. the reversibility rule for fixers) + `web-ext lint`.
  Expected web-ext warnings: Firefox ignores `background.service_worker` (it uses `scripts`), and
  `data_collection_permissions` is newer than `strict_min_version` 121 (older Firefox ignores it).
- `npm run audit`: run all fixers on the real sites in `test/sites.txt`; writes
  `test/audit-report/<host>.json` (every change with context) and `summary.md`.
  `npm run audit -- https://site.ua/` for specific URLs; `SHOTS=1` adds before/after
  pictures of contrast fixes.
- `npm run audit -- --compare main`: runs `main`'s extension and the working tree on the SAME page
  load and writes `test/audit-report/compare.md` with changes that are new or gone (plus anything
  revert left behind). Use this after changing a fixer.
- `npm run icons`: re-render the PNG icons after editing `extension/icons/icon.svg`
- Load in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/`
- Load in Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `extension/manifest.json`

## Conventions
- Plain JavaScript, no build step for now (keeps "Load unpacked" instant). Consider TypeScript + esbuild later.
- User-facing text is Ukrainian. Code, comments and commit messages in English.
- When adding a fixer, add a broken example to `test/fixtures/broken.html` and a check to `test/run-fixers.mjs`.
  When a real-site audit finds a false positive, add it to the fixture as a "must stay untouched" check.
- Test real changes with a screen reader (NVDA is free on Windows; VoiceOver on Mac) before calling them done.

## Changes go through OpenSpec
Behavior is specified in `openspec/specs/<capability>/spec.md` (page-safety, activation,
page-language, image-alt, control-names, form-labels, text-contrast, focus-visibility, extension-ui).
Those specs are the source of truth for what the extension does; project context and
per-artifact rules live in `openspec/config.yaml`.

For any change in behavior (OpenSpec 2.x skills; ask in plain words like "openspec propose …" or
use the slash command):
1. `/openspec-propose <idea>` creates `openspec/changes/<name>/` with proposal, delta specs, design, tasks.
   Use `/openspec-explore` first when the idea is still fuzzy; `/openspec` when unsure what's next.
2. Review and edit the artifacts (`/openspec-update-change`), then `/openspec-apply-change` to implement.
3. `/openspec-archive-change` when done: merges the delta specs into `openspec/specs/` and moves
   the change to `openspec/changes/archive/`.

Skills live in `.agents/skills/` (shared with other AI tools); `.claude/skills/` holds symlinks to
them. After upgrading the CLI (`npm install -g @fission-ai/openspec@latest`), run `openspec update`.

Small fixes that don't change specified behavior (typos, refactors, test-only changes) can skip this.
`openspec validate --strict` and `openspec list` check the state; `openspec view` shows a dashboard.

## Working with agents
- **Branches and PRs.** `main` is protected: work on a branch, open a PR, CI (`.github/workflows/ci.yml`)
  must pass. The PR template has the principles checklist. Project permissions deny pushing to `main`.
- **Hooks** (`.claude/settings.json`): after every edit to a `.js`/`.mjs` file the file is linted, and
  edits under `extension/`, `test/fixtures/` or `test/run-fixers.mjs` also run `npm test`; failures
  come back immediately, fix them before moving on. A SessionStart hook installs dependencies and
  Chromium when missing (fresh clones, cloud sessions).
- **Subagents** (`.claude/agents/`): `a11y-reviewer` reviews a diff against the principles and specs
  without your reasoning; use it before opening a PR that changes behavior. `audit-triage` runs the
  real-site audit and returns only suspicious changes; use it after changing a fixer instead of
  reading audit JSON in the main conversation.
- **Skill** `run-extension`: how to see the extension working (e2e, a specific site, screenshots).
- **MCP**: `.mcp.json` adds a headless, isolated Playwright browser for looking at a site's markup and
  accessibility tree interactively. It doesn't load the extension.
- **Can't be automated**: listening with NVDA/VoiceOver. When a change affects what users hear,
  say exactly what to listen for and leave it to a human.

## Roadmap
See `docs/ROADMAP.md`.

## Known limitations
- `accessibleName()` is a simplified accname algorithm, good for "has a name or not", not exact.
  `npm test` checks it agrees with Chromium on the fixture's controls. Unlike Chromium it doesn't
  count a placeholder as a name, on purpose: a placeholder alone gets a proper label.
- Contrast fixer skips text over background images/gradients (can't know the real background).
- Shadow DOM and iframes are not handled yet.
- Chrome on Android has no extensions; mobile support means Firefox for Android and Safari on iOS.
