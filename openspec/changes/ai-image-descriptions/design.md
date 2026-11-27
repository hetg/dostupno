# Design

## Context

- The images fixer flags undecidable images with `data-dostupno-needs-ai="alt"` (set directly;
  `revertAll()` clears all markers). `Dostupno.changes` now has `setAttr` and `removeAttr`.
- The privacy gate (`extension/src/privacy.js`) exists in page and background: `mayShareFrom`,
  `mayShareUrl(url, settings)`, `pageLooksPrivate`, `pageHost`. It reads `window`/`globalThis`,
  so it also loads in a Worker.
- `content.js` passes `ctx = { initial, profiles }` to fixers and today re-applies only on
  `profiles` changes. `background.js` relays nothing yet.
- Settings: `{ enabled, profiles, disabledSites, ai, privateSites }` in `chrome.storage.sync`.
- See proposal.md for why; the specs for the behavior.

## Goals / Non-Goals

**Goals:** one request path (page → background → backend → model) that fails closed at every
hop; descriptions applied and reverted like any fix; a backend testable without network or key;
an e2e test of the real extension against a mock backend on a public-looking host.

**Non-Goals:** deploy, rate limiting, release enablement (change 3); control names and labels.

## Decisions

### 1. Request path and who checks what
```
content (ai-images fixer)           background                         backend (Worker)
 gate: mayShareFrom(location.href)   gate: mayShareFrom(sender.url)     pageHost public, not private
       !pageLooksPrivate(document)         Firefox consent present      each imageUrl: mayShareUrl
       mayShareUrl(url, settings)          mayShareUrl(url, settings)   fetch image (limits)
 batch ≤ 8 ─ runtime message ──────▶ pageHost(sender.url) ── fetch ──▶ cache ▸ model ▸ cache
 apply via Dostupno.changes ◀─────── results ◀───────────────────────── results
```
The page never talks to the backend directly. The background is the only place with network
access and the authoritative check, because `sender.url` can't be faked by page scripts. The
backend re-checks with the same `privacy.js` in case a modified client calls it.

### 2. Client is a fixer: `src/fixers/ai-images.js`
A fixer gets revert and stop semantics for free and runs only with the screen reader profile.
It is listed after `images.js`, so flags exist when it runs.
- `run(root, ctx)`: return unless `ctx.settings.ai === true` and the page gate passes
  (`mayShareFrom(location.href, ctx.settings)`). Observe `img[data-dostupno-needs-ai="alt"]` in
  `root` with one `IntersectionObserver` (`rootMargin: "100% 0px"`, about a screen ahead).
- On intersect: unobserve, queue. Flush after 400 ms or at 8 items. Images rendered smaller than
  24 px (or loaded that small) are skipped: tracking pixels, not content (the quality check sent a
  0×0 ad pixel). At flush:
  `!pageLooksPrivate(document)` (once per batch) and, per image, `url = img.currentSrc || img.src`
  with `mayShareUrl(url, settings)`. A lazy image whose URL isn't shareable yet (a `data:`
  placeholder) gets one `load` listener and is re-queued when it loads. Context comes from
  decision 4.
- Send `{ type: 'dostupno:describe', items }` with `chrome.runtime.sendMessage`. On the answer,
  for each image: drop it unless `isConnected`, still flagged, and `alt` still absent or still
  a file name (same test as the images fixer). Apply with
  `D.changes.setAttr(img, 'alt', decorative ? '' : 'ШІ: ' + alt)` and
  `D.changes.removeAttr(img, 'data-dostupno-needs-ai')`. A `null` result: remember the image in
  a `WeakSet`, so it isn't asked again this page view.
- `stop()`: disconnect the observer, clear the queue and timers, remove `load` listeners, and
  bump a generation counter; answers from an older generation are ignored (principle 3).

### 3. Settings reach fixers; `ai`/`privateSites` re-apply
`content.js` passes `ctx.settings` (a frozen copy). In `onChanged`, `apply()` (revert and re-run)
also runs when `ai` changes, or when `privateSites` changes and the page decision
`mayShareFrom(location.href, settings)` differs before and after. Re-running is the same path
profiles use, so turning AI off removes AI descriptions and restores the flags. Nothing is
announced.

*Alternative:* a special "settings changed" hook so only the AI fixer reacts. More code and a
second state path; re-applying is already fast and proven.

### 4. Context: at most 300 characters of nearby text
In order, de-duplicated and trimmed to 300 characters total: the image's `title`, the nearest
`figcaption`, the card heading (`h1`–`h4` within the nearest `article`/`li`/`figure`/`section`);
if none of those exists, the text of the nearest wrapper up to 5 levels up, when it is 10–200
characters and the wrapper has no form fields (news cards that keep the headline in a plain
`div`, as on pravda.com.ua, found in the quality check); then the section's first heading.
Never form field values, never `document.title`. That's enough to name a place, event or person
the page itself names, without sending page content.

### 5. Background relay (`background.js`)
- `onMessage` for `dostupno:describe` (answers asynchronously with `sendResponse`, which works in
  both browsers): load settings; refuse unless `mayShareFrom(sender.url, settings)`; in Firefox
  also `permissions.contains({ data_collection: ['websiteContent', 'browsingActivity'] })`.
  Filter items with `mayShareUrl(url, settings)`, and look up a small in-memory LRU
  (500 entries, by URL). Then POST the rest to `<backend>/v1/describe` with
  `{ pageHost: pageHost(sender.url), lang: 'uk', items }` and a 15 s `AbortController` timeout.
  Any error gives `null` results.
- **Backend address:** `const BACKEND_URL = ''` in `background.js` (set in change 3). In
  development installs (`chrome.management.getSelf()` returns `installType: 'development'`; no
  extra permission needed), `chrome.storage.local.devBackendUrl` overrides it. That's how e2e
  and `wrangler dev` testing work; release builds ignore it. `dostupno:ai-available` tells the
  popup whether an address exists.
- The backend is called from the extension origin, so the Worker answers CORS
  (`Access-Control-Allow-Origin: *`, POST and OPTIONS only, no credentials). No
  `host_permissions` are needed, and the manifest's permission prompt doesn't change.

### 6. Backend: plain Worker, small modules, injected dependencies
```
backend/
  package.json        @anthropic-ai/sdk, wrangler (dev); "test": node --test
  wrangler.toml       name dostupno-api, main src/index.js, D1 binding DB (placeholder id,
                      local only), vars MODEL="claude-haiku-5-5"
  migrations/0001_descriptions.sql
  src/index.js        routing, CORS, size limit, JSON parsing → describe()
  src/describe.js     describe(body, deps) — validation, privacy, cache, fetch, model; pure
  src/privacy.js      import '../../extension/src/privacy.js'; export globalThis.Dostupno.privacy
  src/fetch-image.js  fetchImage(url, fetchFn) — limits from the spec
  src/model.js        describeImage({ bytes, mediaType, context }) — the only Anthropic code
  src/cache.js        d1Cache(env.DB) → { get(key), put(key, value, ttl) }
  test/*.test.mjs     node:test with fake fetch, fake model, in-memory cache
  scripts/eval-alt.mjs
```
`describe()` takes `{ fetchImage, describeImage, cache, now }`, so tests run in plain node
without wrangler, network or key. Wrangler bundles `index.js` together with the shared
`privacy.js` (a side-effect import), so client and server never drift.

*Alternatives:* Hono (not needed for one route), KV (only 1,000 writes a day on the free plan;
D1 allows 100,000).

### 7. Model call
One `messages.create` per image (no tools), so a failed or refused image doesn't affect the
others:
- `model: env.MODEL` (`claude-haiku-5-5`), `max_tokens: 1024` (thinking counts toward it),
  `output_config: { effort: 'low', format: { type: 'json_schema', schema } }` with
  `schema = { decorative: boolean, alt: string }` and `additionalProperties: false`. No
  `temperature` (rejected on this model). Thinking stays adaptive; low effort keeps it short.
- System prompt (English instructions, Ukrainian output) carries the style rules from the
  describe-api spec. The user turn has the image as base64 (`source.type: 'base64'`) plus
  `Контекст сторінки: <context>`. The image is fetched by the Worker, not by Anthropic, so the
  fetch limits and redirect checks apply.
- Read content blocks by `type`. On `stop_reason` `refusal` or `max_tokens`, unparsable JSON,
  empty text or over 200 characters → `null`. Strip a leading "Зображення"/"Фото"/"Картинка"
  plus punctuation if the model adds one.
- The SDK's exact field spelling is checked against the installed SDK during apply.
- `PROMPT_VERSION` constant (started at `1`; `2` after the quality check: one sentence, logos as
  "Логотип <name>", ignore watermarks, copy text exactly in its own alphabet; `3`: a word mixing
  Latin and Cyrillic letters makes the description `null`). Cache key:
  `sha256(PROMPT_VERSION + '|' + MODEL + '|' + imageUrl)`.

### 8. Cache (D1)
Table `descriptions(key TEXT PRIMARY KEY, alt TEXT, decorative INTEGER, created_at INTEGER,
expires_at INTEGER NULL)`. Successes don't expire (the key changes with prompt or model).
"Unsupported image" results are stored with `expires_at = now + 1 day`. Refusals and errors
aren't stored. Reads ignore expired rows.

Cross-user note: a description of a public image URL is public; the context that shaped it came
from a public page. The same URL gets the same text on every site (proposal, false-positive risks).

### 9. Popup and welcome page
- New `<fieldset id="ai-section" hidden>` with `<legend>Описи зображень</legend>`, the opt-in
  checkbox and its `.detail` text (exact strings in the extension-ui spec), placed after the
  profiles fieldset. It's shown only when `dostupno:ai-available` is true.
- The per-site block is shown only when `ai` is on and the popup has a web host. If
  `!mayShareFrom(tabUrl, { ai: true })` (built-in private, private path or non-public), it shows
  the note `<p>` instead of the checkbox. The popup loads `../src/privacy.js` with a `<script>` tag.
- Firefox: in the checkbox `change` handler, which counts as a user gesture,
  `await browser.permissions.request({ data_collection: [...] })` before saving. If it returns
  false, untick and don't save. Firefox is detected with `typeof chrome.runtime.getBrowserInfo
  === 'function'`.
- `manifest.json`: `data_collection_permissions.optional: ["websiteContent", "browsingActivity"]`
  (`required` stays `["none"]`).

### 10. Revert and performance
Every DOM change is `setAttr`/`removeAttr` through `Dostupno.changes`, so `revertAll()` restores
`alt` and the flag. `stop()` runs before `revertAll()` and guarantees no later writes.

Large pages: the fixer touches only flagged images inside each new subtree (no rescans). There's
one `IntersectionObserver`, `pageLooksPrivate` runs once per batch (at most every 400 ms while
scrolling), and there's one message and one HTTP request per batch.

### 11. Tests
- **Backend unit** (`backend/test`): validation and 400s, private `pageHost` or `imageUrl`
  refused without fetching, fetch limits (type, size, redirect to a private host), model output
  cleaning and refusal → `null`, one item failing doesn't fail the others, cache hit skips fetch
  and model, prompt version changes the key, unsupported results expire, no key in responses.
- **Smoke** (`run-fixers.mjs`, `file:` page): with `ai: true`, nothing is sent (the gate refuses
  `file:`), and flagged images stay flagged (the must-stay-untouched case). The shim's
  `runtime.sendMessage` records calls. The earlier "no re-run on `ai` change" check flips to
  "re-applies on `ai`, not on an unrelated `privateSites` change".
- **e2e** (`e2e-extension.mjs`): a node mock backend (records requests and answers canned alt
  text) plus Chromium `--host-resolver-rules="MAP news.example.ua 127.0.0.1"`, so the fixture is
  served from a public-looking host. `devBackendUrl` points at the mock. Checks:
  - AI off → 0 requests.
  - Popup shows the AI group (and hides it with no `devBackendUrl`).
  - AI on → the flagged image gets `ШІ: …`, a decorative answer gives `alt=""`, and requests
    contain only `pageHost`, `imageUrl` and `context`.
  - A site `alt` added in flight is kept.
  - A password field on the page → 0 requests. `privateSites: ['news.example.ua']` → 0 requests.
  - AI off again → the descriptions are gone and the flags are back.
- **Quality check** (`backend/scripts/eval-alt.mjs`, manual, paid): collects up to 50 flagged,
  shareable images (with their context) from `test/sites.txt` with Playwright and the content
  scripts. It calls `describeImage` directly with the key from `backend/.dev.vars` and writes
  `test/audit-report/alt-eval.md` (image URL, context, verdict, alt) for human review. It prints
  a cost estimate and needs `--yes` to call the API.

### 13. Fixes from the pre-PR review
- **Context comes from visible text nodes only.** A TreeWalker skips `script`, `style`,
  `noscript`, `template`, `[hidden]`, `[aria-hidden=true]`, form controls and buttons. Any part
  containing an e-mail address, phone number, URL or markup is dropped. There's no `document.body`
  fallback for the section heading. The review found `<noscript>` fallback markup (with a token
  URL the gate had refused) and a signed-in user's name and e-mail in context.
- **Images in `header`/`nav`/banner/navigation roles, avatars and profile pictures** (class, id or
  src hints) and images that already have an ARIA name are never sent.
- **Order at flush:** still flagged and allowed → loaded? (if not: one retry on `load`) →
  shareable URL? (if not: one retry on `load`, for `data:` placeholders) → not tiny → send. Lazy
  images were previously given up on as "too small" while still 0×0.
- **Descriptions follow the picture.** Each applied description keeps `img → url` with `load` and
  `error` listeners. When the site shows a different picture, our `alt` is removed, the flag
  set again (both through `Dostupno.changes`), and the image observed again. `stop()` removes the
  listeners.
- **The IntersectionObserver callback uses its own observer argument and the generation**, so
  entries delivered after `stop()` do nothing.
- **Background:** also requires the screen reader profile, and drops item URLs over 2,048
  characters (the backend would reject the whole batch).
- **Cache:** the key includes the context (sha256 of `PROMPT_VERSION|MODEL|imageUrl|context`), so
  made-up context can't plant a description for other users. Successes expire after 30 days
  (banners, rates and weather change at fixed URLs).
- **Timing:** image fetch 5 s, model 6 s with no retry, so the backend answers within about 11 s,
  under the extension's 15 s. Response bodies are cancelled on redirects, errors and oversize
  (Workers allow 6 open connections). The request body is read with a streaming 16 KB limit.
- **`content.js` re-applies on `ai`/`privateSites` changes only with the screen reader profile
  on**, so low-vision-only users don't see contrast fixes flicker.
- **Popup:** in Firefox, `ai` synced without this browser's consent shows as off. The site switch
  no longer waits for the AI availability round trip.
- **Not changed:** a `privateSites` entry for a parent domain (only typed by hand; the popup
  writes exact hosts) shows the per-site checkbox unticked. This is accepted until there's UI to
  add parent domains.

### 12. Secret fields count only while rendered (found in the quality-check dry run)
The dry run showed pravda.com.ua (13 flagged images) and nv.ua blocked entirely by a password
field in a closed login dialog. `pageLooksPrivate` now ignores secret fields that aren't rendered
(`getClientRects()` empty, or `visibility: hidden`). Off-screen and transparent fields still count.
It runs right before each batch, so opening the dialog stops further sending. Field contents were
never sent either way; the rule is about the page being private. Payment-frame iframes still
count whether visible or not (unchanged).

## Risks / Trade-offs

- [Wrong or odd descriptions] → the "ШІ: " prefix, the style rules, the human-reviewed quality
  check before change 3 enables release builds, and `PROMPT_VERSION` to invalidate the cache
  after prompt fixes.
- [Sites blocking the Worker's image fetch (hotlink protection, geo)] → the result is `null`
  (unchanged image). Measured in the quality check.
- [Lazy-loading patterns not caught by one `load` retry] → the image stays flagged, the same as
  today.
- [Firefox `data_collection` API shape] → checked by hand in real Firefox later (roadmap). Chrome
  ignores the manifest key and skips the request.
- [`chrome.management.getSelf` dev override misused] → it only exists in unpacked installs, which
  a user loads deliberately.
- [Re-applying on every `ai` toggle] → reverts and re-runs once per toggle, the same cost as a
  profile change.
- [Worker image fetch spending money on huge images] → the 5 MB limit; the model downsizes beyond
  its maximum resolution (worst case about 4.8k image tokens ≈ $0.0005).

### Notes for change 3 (deploy)
- On the free plan a Worker gets 10 ms of CPU per request. Base64 of large images (up to 8 × 5 MB)
  won't fit, so either use the paid plan's CPU limit or lower the image size limit (for example
  1.5 MB) and measure.
- Up to 8 items × (≤ 4 image hops + 1 model call) is up to 40 subrequests against the limit of 50.
  Keep `maxRetries: 0`.
- Open CORS on an unauthenticated paid endpoint: add per-install tokens or rate limiting before
  `BACKEND_URL` is set.

## Migration Plan

- Settings are unchanged (`ai`, `privateSites` already exist with safe defaults).
- Release builds behave as before (AI hidden) until change 3 sets `BACKEND_URL`.
- Rollback: remove the fixer from the manifest; the backend isn't deployed.

## Open Questions

- Whether to include `document.title` in the context if the quality check shows names are often
  missing. It changes only decision 4's list.
