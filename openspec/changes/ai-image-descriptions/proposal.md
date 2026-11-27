# Proposal

## Why

The images fixer can only decide what's decorative or already captioned. Every other content
image is flagged `data-dostupno-needs-ai="alt"` and stays silent, or is announced as a file name,
to a screen reader user. On news, hromada and shop pages that's most of the photos. The privacy
gate from `privacy-exclusions` now makes it safe to send public image URLs, so this change adds
the AI backend and the extension client that turn those flags into short Ukrainian descriptions.

## What Changes

- **Backend (`backend/`, Cloudflare Worker, local only in this change):** `POST /v1/describe`
  takes a page host and up to 8 items of `{ imageUrl, context }`. It refuses private hosts and
  URLs using the same `privacy.js` as the extension, fetches each image itself (size, type and
  redirect limits), and asks Claude Haiku 5.5 for one Ukrainian sentence or "decorative".
  Results go in a shared D1 cache keyed by image URL plus prompt and model version, so a repeat
  costs nothing. Built and tested with `wrangler dev` and unit tests. No deploy yet.
- **Extension client:** a new screen-reader fixer, `ai-images`, watches flagged images as they
  come near the viewport. It batches them, checks the privacy gate in the page, and asks the
  background. The background checks the gate again with the browser-reported URL, sends only the
  page host, the image URLs and short nearby text, and returns the results. Descriptions are
  applied through `Dostupno.changes` as `alt="ШІ: …"`, or `alt=""` for decorative images, so
  they revert like every other fix.
- **Opt-in UI:** the popup and the welcome page get a checkbox, "Описувати зображення за
  допомогою ШІ", off by default, with a one-line explanation of what is sent. The popup also
  gets a per-site checkbox, "Не надсилати нічого з цього сайту", or a note when the site is
  private anyway. In Firefox, ticking the checkbox asks for the browser's data-collection
  consent.
- **Release gating:** the AI controls appear only when a backend address is configured. Release
  builds have none until change 3 (rate limiting and deploy). Unpacked development installs can
  point at `wrangler dev` or a mock server.
- **Settings:** turning `ai` on or off, or excluding the current site, re-applies the page's
  fixes (revert and re-run), so descriptions appear or disappear without a reload. This
  **modifies** the `privacy-exclusions` rule that these settings never re-run fixers.
- **Quality check:** a script runs Haiku on about 50 real flagged images from `test/sites.txt`
  and writes a report for human review. It costs about $0.01 and runs only with the user's approval.

## Capabilities

### New Capabilities
- `describe-api`: the backend's contract. Request and response shape, limits, server-side
  privacy refusal, image fetching rules, description style, caching, and failure behavior.

### Modified Capabilities
- `image-alt`: flagged images get an AI description when the user opted in and the gate allows
  it ("Unknown images are flagged, not guessed" changes; new requirements for applying and
  reverting AI descriptions).
- `extension-ui`: AI opt-in checkbox (popup and welcome page), per-site "don't send" checkbox,
  private-site note, hidden when no backend is configured, Firefox consent.
- `activation`: changing `ai`, or `privateSites` for the current site, re-applies the page's fixes.
- `data-sharing`: secret fields block sending only while they are rendered. A closed login dialog
  made pravda.com.ua and nv.ua entirely private in the quality-check dry run.

## Principles touched

- **1. Never make a page worse:** any failure (refusal, timeout, odd output, an image changed
  meanwhile) leaves the image as it was: flagged, no alt. The "ШІ: " prefix tells users a
  description may be wrong. Images the site described in the meantime are never overwritten.
- **2. Don't override the site:** only images still flagged and still without a real `alt` at
  apply time are changed.
- **3. Reversible:** descriptions go through `Dostupno.changes.setAttr`/`removeAttr`. The fixer's
  `stop()` cancels pending requests, and late answers are dropped.
- **4. Silent:** no announcements. Screen readers read the new `alt` as usual.
- **5. Accessible UI:** new controls are native checkboxes with visible labels and descriptions;
  keyboard, screen reader, high contrast and 200% zoom checks are in the tasks.
- **6. Privacy:** off by default. Gate in the page and in the background; the backend refuses
  private hosts too. Only the page host, public image URLs and up to 300 characters of nearby
  text leave the device. Firefox data-collection consent is asked when the user opts in.
- **7. Performance:** only flagged images near the viewport, batched (≤ 8 per request,
  debounced); no rescans; background keeps a small in-memory cache.
- **8. Failing code can't break the page:** the fixer runs inside content.js's try/catch, and
  network or parse errors resolve to "no description".

## Non-goals

- Deploying the backend, rate limiting, abuse protection, and turning the feature on in release
  builds. All of that is change 3.
- Names for icon-only controls and labels for fields (`needs-ai="name"`/`"label"`): a later change.
- "Report a wrong description" (Weekend 3).
- CSS background images, `<picture>` art direction beyond `currentSrc`, SVG, AVIF (unsupported
  formats stay flagged), and images in iframes or Shadow DOM.
- Comparing models. Haiku 5.5 was chosen; the quality check only confirms it's good enough.

## False-positive risks

- **A wrong description** (the main risk): mitigated by the "ШІ: " prefix, a one-sentence style,
  no guessing of identities (people are named only when the nearby text names them), and the
  human-reviewed quality check before enabling.
- **Marking a meaningful image decorative:** the prompt asks for "decorative" only for purely
  ornamental images. The quality check reports every decorative verdict for review.
- **A stale cache across pages:** the same image URL gets the same description everywhere, even
  when the nearby text differs. Acceptable for news and shop images; noted in the design.
- **Overwriting a late site alt:** the client re-checks the image right before applying.

## Impact

- New: `backend/` (`wrangler.toml`, `src/`, `migrations/`, `test/`, `scripts/eval-alt.mjs`, own
  `package.json` with `@anthropic-ai/sdk` and `wrangler`), `extension/src/fixers/ai-images.js`.
- Changed: `extension/src/content.js` (settings in `ctx`, re-apply on `ai`/`privateSites`),
  `background.js` (describe relay, gate re-check, backend address, cache),
  `popup/popup.html|js|css`, `manifest.json` (fixer script; Firefox optional data collection
  `websiteContent`, `browsingActivity`), tests (`run-fixers.mjs`, `e2e-extension.mjs`, a mock
  backend), CI (backend install and tests), `CLAUDE.md`, `backend/README.md`, `docs/ROADMAP.md`.
- The `privacy-exclusions` and `ignore-animated-placeholders` archive moves ship in the same PR.
