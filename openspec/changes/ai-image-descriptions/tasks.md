# Tasks

## 1. Backend scaffold

- [x] 1.1 Create `backend/package.json` (private, `"type": "module"`, deps `@anthropic-ai/sdk`, dev `wrangler`; scripts `dev` = `wrangler dev`, `test` = `node --test "test/*.test.mjs"`, `db:local` = apply migrations locally), `backend/wrangler.toml` (name `dostupno-api`, `main = "src/index.js"`, current `compatibility_date`, D1 binding `DB` with a placeholder id and a comment that change 3 creates the real database, `[vars] MODEL = "claude-haiku-5-5"`) and `backend/migrations/0001_descriptions.sql` (design decision 8). Verify `npm ci --prefix backend` and `npx --prefix backend wrangler d1 migrations apply DB --local` succeed.
- [x] 1.2 Add `backend/src/privacy.js` that imports `../../extension/src/privacy.js` for its side effect and exports `globalThis.Dostupno.privacy`; add a test that it refuses `privatbank.ua` and allows a public image URL. Verify `npm test --prefix backend` passes.
- [x] 1.3 Lint: add an ESLint block for `backend/**/*.js` and `backend/**/*.mjs` (ES modules, worker and node globals as appropriate) and ignore `backend/node_modules` and `backend/.wrangler`. Verify `npm run lint` passes.

## 2. Backend logic (no network, no key)

- [x] 2.1 `src/fetch-image.js`: `fetchImage(url, fetchFn)` with a timeout, 5 MB limit (header and streamed count), `redirect: 'manual'` with at most 3 hops each re-checked by `mayShareUrl`, and allowed types JPEG/PNG/GIF/WebP only; returns `{ bytes, mediaType }` or `{ unsupported: true }` or throws. Verify with tests: SVG, oversize, redirect to `10.0.0.5`, too many redirects, timeout.
- [x] 2.2 `src/describe.js`: `describe(body, deps)` implementing the describe-api spec (validation and limits → 400; private `pageHost` refuses all; per-item `mayShareUrl`; cache lookup; fetch; model; output cleaning; per-item failure isolation; caching rules; results in order). Verify with tests for every describe-api scenario using fake `fetchImage`, `describeImage` and an in-memory cache, including that refused items are never fetched and that no response contains the key.
- [x] 2.3 `src/cache.js`: `d1Cache(db)` with `get(key, now)` ignoring expired rows and `put(key, value, ttlMs?)`; cache key helper `sha256(PROMPT_VERSION|MODEL|imageUrl)`. Verify with a test against a tiny fake D1 (prepare/bind/first/run) and a test that changing `PROMPT_VERSION` changes the key.
- [x] 2.4 `src/index.js`: routes `POST /v1/describe` and `OPTIONS` (CORS per design decision 5), 404 otherwise, 16 KB body limit, JSON errors → 400, wires real deps from `env`. Verify with tests calling the default export's `fetch(request, env)` with fake deps injected through a test hook.

## 3. Model call

- [x] 3.1 `src/model.js`: `describeImage({ bytes, mediaType, context }, { apiKey, model })` with the official SDK per design decision 7 (check the installed SDK's `output_config` / structured-output spelling in its README or types first). Reads blocks by type, maps refusal / max_tokens / bad JSON / empty / > 200 chars to `null`, strips "Зображення/Фото/Картинка" prefixes. Verify with tests that stub the SDK client (no network): refusal → null, prefix stripped, decorative → `{ alt: '', decorative: true }`.
- [x] 3.2 Run `npm run dev --prefix backend` with the user's key in `backend/.dev.vars` and send one real request for one public image with curl (about $0.0002; ask the user before running). Verify a Ukrainian `alt` comes back and a second identical request returns `source: "cache"`.

## 4. Extension: settings reach fixers

- [x] 4.1 `content.js`: pass `ctx.settings` (frozen copy) to fixers; in `onChanged`, also `apply()` when `ai` changes or when `privateSites` changes the page decision `mayShareFrom(location.href, …)` (design decision 3). Verify `npm test` passes after updating the smoke test.
- [x] 4.2 Smoke test (`run-fixers.mjs`): replace "AI opt-in and site exclusion neither revert nor re-run fixers" with "changing `ai` re-applies the page" (revert spy > 0) and "adding an unrelated site to `privateSites` doesn't" (0 reverts, 0 runs). Verify `npm test` passes, and that the old mutant (`if (true) apply()`) now fails the unrelated-site check.

## 5. Extension: the `ai-images` fixer

- [x] 5.1 Create `extension/src/fixers/ai-images.js` per design decisions 2 and 4 and add it to `manifest.json` right after `src/fixers/images.js`. Verify `npm run lint` (including the reversibility rule) passes.
- [x] 5.2 Smoke test: the shim records `runtime.sendMessage` calls; with `ai: true` on the `file:` fixture no `dostupno:describe` message is sent and every flagged image keeps its flag and no `alt` (must stay untouched). Add a comment in `test/fixtures/broken.html` next to the flagged images saying they are the AI candidates. Verify `npm test` passes.

## 6. Extension: background relay

- [x] 6.1 `background.js`: `BACKEND_URL = ''`, dev override from `storage.local.devBackendUrl` only when `management.getSelf().installType === 'development'`, `dostupno:ai-available`, and `dostupno:describe` per design decision 5 (gate re-check with `sender.url`, Firefox consent check, `mayShareUrl` filter, LRU, `pageHost` only, 15 s timeout, nulls on any error). Verify with the node background-loading test in `test/privacy.test.mjs` still passing and the e2e checks in group 8.

## 7. Popup, welcome page, manifest

- [x] 7.1 `popup.html/js/css`: "Описи зображень" fieldset (hidden unless AI is available), opt-in checkbox with detail text, per-site checkbox or private-site note (exact strings from the extension-ui spec), `../src/privacy.js` loaded; welcome page shows the opt-in after profiles. Verify the e2e popup checks in group 8.
- [x] 7.2 Firefox consent: request `data_collection: ['websiteContent', 'browsingActivity']` in the checkbox handler when `chrome.runtime.getBrowserInfo` exists; untick on decline. `manifest.json`: add `data_collection_permissions.optional`. Verify `web-ext lint` shows only the expected warnings, and note the manual Firefox check on the roadmap item.
- [x] 7.3 Accessibility of the new controls: keyboard only (Tab, Space), visible focus, labels and descriptions announced, high contrast (forced colors), 200% zoom without horizontal scroll. Verify the e2e accessibility-tree check that both checkboxes have their names and descriptions; flag the VoiceOver/NVDA listen for the user (manual).

## 8. End-to-end with a mock backend

- [x] 8.1 `test/mock-backend.mjs` (node http server recording requests; canned answers including one decorative) and `e2e-extension.mjs` additions per design decision 11: host mapping `news.example.ua`, `devBackendUrl`, AI off → 0 requests, popup group visible/hidden, AI on → `ШІ: …` and `alt=""`, request bodies contain only `pageHost`, `lang`, `items[{imageUrl, context}]` with `context.length ≤ 300`, site alt added in flight kept, password field → 0 requests, `privateSites` → 0 requests, AI off → descriptions gone and flags back. Verify `npm run test:e2e` passes.

## 9. CI and docs

- [x] 9.1 CI: install backend deps (`npm ci --prefix backend`) and run `npm test --prefix backend` as its own step; add backend tests to `npm run check`. Verify by reading the workflow diff and running `npm run check`.
- [x] 9.2 Update `CLAUDE.md`: architecture (backend layout, `ai-images` fixer, relay), fixer list (`ai-images` (screenreader)), commands (`npm run dev --prefix backend`, backend tests, how to point an unpacked extension at `wrangler dev` via `devBackendUrl`), and that AI is hidden in release builds until change 3. Update `backend/README.md` (actual API, limits, local run, the shared privacy.js decision) and `docs/ROADMAP.md` (tick the endpoint, cache, client, popup items; leave deploy, rate limiting and `data_collection_permissions` real-Firefox check open). Update the `run-extension` skill with the `devBackendUrl` recipe. Verify by reading the diffs.

## 10. Quality check (paid, needs the user's go-ahead)

- [x] 10.1 Write `backend/scripts/eval-alt.mjs` per design decision 11 (collect ≤ 50 flagged shareable images with context from `test/sites.txt`, print the cost estimate, require `--yes`, write `test/audit-report/alt-eval.md`). Verify a dry run without `--yes` lists the images and the estimate and makes no API call.
- [x] 10.2 With the user's approval, run it with `--yes` and review the report together: count wrong, odd or over-long descriptions and decorative verdicts; adjust the prompt (bump `PROMPT_VERSION`) if more than a few are wrong. Verify by summarizing the counts in the PR.

## 11. Integration

- [x] 11.1 Run `npm run audit -- --compare main` (via `audit-triage`) to confirm the non-AI fixers' output is unchanged (AI is off by default and the backend address is empty). Verify the compare summary shows no differences beyond known harness noise.
- [x] 11.2 Run `npm run check` and the `a11y-reviewer` agent on the branch diff; resolve findings. Verify everything passes and there are no unresolved principle-6 findings.
- [ ] 11.3 Manual, for the user: with `wrangler dev` and `devBackendUrl`, listen with VoiceOver on a news site. Images are read as "ШІ: …", the popup controls are announced with their descriptions, and turning AI off removes the descriptions. Record it in the PR.

## 12. Found during apply

- [x] 12.1 Secret fields block sending only while rendered (design decision 12; data-sharing delta). The quality-check dry run found pravda.com.ua and nv.ua fully blocked by a closed login dialog. Verify with new Chromium cases in `test/privacy.test.mjs` (hidden, `display:none`, closed `<dialog>`, `visibility:hidden` don't count; open dialog, off-screen, transparent, opened later do) and the e2e login page (visible field) still sending nothing.

- [x] 12.2 Quality check round 1 (20 images, prompt v1): 14 described, 5 SVG unsupported, ~half with problems (two sentences, > 150 chars, garbled mixed-alphabet word, watermark logos described, over-described logo, no context on pravda cards). Prompt v2 and the card-text context fallback (design decisions 4 and 7). Verify the backend tests and `npm test` pass.

- [x] 12.3 Quality check round 2 (prompt v2, card-text context): all ≤ 150 chars, logo as "Логотип …", watermarks mostly ignored, pravda gets headlines; remaining: mixed-alphabet garble in 2 banners, one extra watermark sentence, and a 0×0 ad pixel sent. Added: mixed-alphabet words → no description (prompt v3), quotes stripped only when wrapping the whole sentence, tiny/invisible images never sent. Verify the backend tests and the e2e "1×1 tracking pixel is never sent" check pass.

## 13. Fixes from the pre-PR review

- [x] 13.1 Context from visible text nodes only (no `noscript`/`script`/hidden/form text; parts with e-mail, phone, URL or markup dropped; no page-wide heading fallback); header/nav/avatar and ARIA-named images never sent (data-sharing delta: two new requirements). Verify the e2e checks for noscript, e-mail and avatar.
- [x] 13.2 Withdraw a description when the site swaps the picture (image-alt "Descriptions follow the picture"); lazy images retried on load before the size check; observer callback guarded by generation. Verify the e2e swap, lazy and late-answer (AI off and site off) checks, with a mutant showing the late-answer check fails without the guard.
- [x] 13.3 Background requires the screen reader profile and drops URLs over 2,048 chars; node tests load the real background with fake chrome/fetch and assert no fetch for a bank `sender.url`, subframe, foreign sender, no tab, AI off, profile off, excluded or turned-off site, Firefox without consent, release build; and the exact body. Verify `npm run test:privacy` and mutants (no `sender.url` check, no `frameId` check) fail it.
- [x] 13.4 Cache key includes context, successes expire after 30 days; timeouts 5 s fetch + 6 s model (no retry) < 15 s client; bodies cancelled; streamed 16 KB request limit (describe-api delta). Verify the backend tests (poisoning, expiry, body-size-only case, streamed body).
- [x] 13.5 Re-apply on `ai`/`privateSites` only with the screen reader profile; popup Firefox consent display and non-blocking site switch; eval script reads MODEL from wrangler.toml and filters tiny images; e2e "unreachable backend" and "profile off" cases; notes for change 3 in the design. Verify `npm run check`.

## Workflow follow-up

- The PR also carries the archive of `privacy-exclusions` and `ignore-animated-placeholders`.
- After merge, archive `ai-image-descriptions`; change 3 (rate limiting, deploy, `BACKEND_URL`) follows.
