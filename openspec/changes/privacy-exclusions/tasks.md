# Tasks

## 1. Privacy gate core

- [x] 1.1 Create `extension/src/privacy.js` (classic IIFE on `globalThis.Dostupno.privacy`) with `isPublicHost`, `isPrivateHost`, `mayShareFrom(pageUrl, settings)`, `mayShareUrl(itemUrl)` and `pageLooksPrivate(doc)` per design decisions 2–6. Every function fails closed in try/catch. Verify `npx eslint extension/src/privacy.js` passes.
- [x] 1.2 Add the built-in private list (design decision 7) as one frozen array grouped by commented category. Check every domain resolves (`dig +short <domain>` or `node -e "require('dns').promises.resolve(...)"` over the list) and drop or fix any that don't. Verify by pasting the resolver output into the PR description.
- [x] 1.3 Add `test/privacy.test.mjs` (`node:test`, loads `privacy.js` via `vm.createContext` + `vm.runInContext`) covering every data-sharing scenario on hosts and URLs: opt-in off by default, bank subdomain, Diia, Gmail, look-alikes `notprivatbank.ua` and `privatbank.ua.example.com`, intranet, IP and `file:`, `privateSites` subdomain match, public image allowed, signed or token URLs, `data:`/`blob:`/credentials, intranet image on a public page, a throwing input returning "don't send". Verify `node --test test/privacy.test.mjs` passes.
- [x] 1.4 Extend `test/privacy.test.mjs` with a Playwright `setContent` check of `pageLooksPrivate`: password field, `autocomplete="cc-number"`, `one-time-code`, LiqPay iframe all private; a plain article with images and a search field not private. Verify the test passes.
- [x] 1.5 Add `node --test test/privacy.test.mjs` to the `check` script in `package.json` (and a `test:privacy` script). Verify `npm run check` runs it.

## 2. Loading in page and background

- [x] 2.1 Add `src/privacy.js` to `manifest.json` `content_scripts[0].js` right after `src/core.js`, and to `background.scripts` before `src/background.js`. Verify `web-ext lint` shows only the expected warnings listed in CLAUDE.md.
- [x] 2.2 At the top of `background.js`, load the gate in Chrome's service worker with the guarded `importScripts('privacy.js')` (design decision 1). Add an e2e check in `test/e2e-extension.mjs` that `Dostupno.privacy.mayShareFrom` is a function in the worker and returns `false` for `https://privatbank.ua/` with `{ ai: true, privateSites: [] }`. Verify `npm run test:e2e` passes.
- [x] 2.3 No Firefox on the dev machine, so test Firefox's loading path in node instead: run `background.scripts` in order without `importScripts` (Firefox event page) and `background.js` alone with `importScripts` (Chrome worker), and assert the gate loads once and refuses a bank site. Verify `npm run test:privacy` passes. The check in real Firefox (`about:debugging`, background console) moves to the Weekend 4 Firefox item in `docs/ROADMAP.md`.

## 3. Settings defaults

- [x] 3.1 Add `ai: false, privateSites: []` to `DEFAULTS` in `content.js`, `background.js` and `popup/popup.js`, and to the store shim in `test/run-fixers.mjs`. Verify `npm test` passes unchanged.
- [x] 3.2 Add a run-fixers check: `Dostupno.privacy` exists after the content scripts load, and calling `__setStore({ ai: true })`, then `__setStore({ privateSites: ['example.ua'] })`, leaves the change count and fixed names unchanged (no revert, no re-run). This is the "must stay untouched" case. Verify `npm test` passes.
- [x] 3.3 Fixtures: no fixer behavior changes, so `test/fixtures/broken.html` gets no new broken example. The fixture is a `file:` page, which the gate treats as non-public, which covers "private pages keep local fixes"; add a comment saying so next to the new check in `run-fixers.mjs`. Verify `npm test` passes.
- [x] 3.4 Run `npm run audit -- --compare main` (via the `audit-triage` agent) and confirm `compare.md` shows no new or missing changes. Verify by quoting the summary line in the PR.

## 4. Documentation

- [x] 4.1 Update `CLAUDE.md`: architecture entry for `src/privacy.js` (shared by content and background), settings shape with `ai` and `privateSites`, and a principle-6 note that any code sending data off-device must call `mayShareFrom` in the page and again in the background (with `sender.url`) and `mayShareUrl` per item. Add the `test:privacy` command. Verify the file reads correctly and `npm run lint` passes.
- [x] 4.2 Update `backend/README.md` "Rules" to point at `extension/src/privacy.js` as the source of the excluded-domain list. Update `docs/ROADMAP.md` to tick the built-in exclusion list and user exclusions (storage and gate), noting that the UI follows with the backend. Verify by reading both diffs.

## 5. Integration

- [x] 5.1 Run `npm run check` (lint, smoke, privacy, e2e, `openspec validate --all --strict`). Verify everything passes.
- [x] 5.2 Run the `a11y-reviewer` agent on the branch diff and resolve its findings. Verify there are no unresolved principle-6 findings.

## 6. Fixes from the independent review

- [x] 6.1 Run `npm run test:privacy` as its own CI step in `.github/workflows/ci.yml` and list it in CLAUDE.md's `npm run check` line. Verify by reading the workflow diff.
- [x] 6.2 Fail closed on malformed `privateSites` (not an array, non-string or unparsable entry); normalize entries (`https://…`, `*.`, uppercase, `:port`, unicode); `isPrivateHost`/`isPublicHost` accept URLs and `host:port`; strip any number of trailing dots. Verify with new cases in `test/privacy.test.mjs`.
- [x] 6.3 Broaden secret URL parameters (normalized names, substrings, `;` separator, `;jsessionid=` in path, `=` in fragment, Facebook CDN `oh`/`oe`). Verify with new cases in `test/privacy.test.mjs`.
- [x] 6.4 Add never-public suffixes (`.onion`, `.i2p`, `.test`, `.example`, `.invalid`, `.localdomain`, `.home`) to code and spec. Verify with new cases in `test/privacy.test.mjs`.
- [x] 6.5 Add `myaccount.google.com`, `photos.google.com`, `sharepoint.com` to the list, private paths for direct messages on Facebook, Instagram, X and LinkedIn (spec requirement "Private sections of public sites never share"), and check that every new domain resolves. Verify with new cases in `test/privacy.test.mjs`.
- [x] 6.6 `pageLooksPrivate`: payment iframes (Stripe, Braintree, Adyen, Google Pay, Checkout.com), `[type=password]` on custom elements, walk Shadow DOM (closed roots via content-script API). Verify with new Chromium cases in `test/privacy.test.mjs`.
- [x] 6.7 Add `pageHost(url)` and the spec requirement "Only the page host is sent about the page"; document it in CLAUDE.md and `backend/README.md`. Verify with new cases in `test/privacy.test.mjs`.
- [x] 6.8 Fix the e2e fresh-install check to read real storage (`get(null)`), the run-fixers comment about the `file:` fixture, the README/proposal wording on the backend list, and keep "no full-page uploads" on the roadmap. Verify `npm run check` passes.

## 7. Fixes from the second review

- [x] 7.1 `privateSites` entries: strip leading `.`/`*.` (also after a scheme), reject leftover `*` or empty labels (fail closed). Verify with new cases in `test/privacy.test.mjs`.
- [x] 7.2 Private paths: match on the percent-decoded path, prefix followed by end or a non-word character; undecodable paths count as private. Apply private paths to item URLs too. Verify with new cases.
- [x] 7.3 Item URLs: refuse any fragment; add `otp`, `pwd`, `pin`, `ticket`, `email`, `phone` params; optional `settings` argument applies the user's settings to the item host. Verify with new cases.
- [x] 7.4 `mayShareFrom` refuses when `enabled` is false or the host is in `disabledSites` (new spec requirement "Sites where Доступно is off never share"). Verify with new cases.
- [x] 7.5 List additions (all checked to resolve): `ton.twitter.com`, Google chat/meet/calendar/contacts/keep/gemini, Proton drive/calendar/pass/account, `chatgpt.com`, `claude.ai`, router admin hosts; non-public `.alt`, `nip.io`, `sslip.io`, `localtest.me`. Verify with new cases.
- [x] 7.6 `pageLooksPrivate`: card fields without autocomplete, same-origin frames, call the shadow-root API only on elements that can host one. Verify with new Chromium cases (Adyen, Google Pay, Checkout.com, PayPal frames, deep-nesting limit).
- [x] 7.7 Smoke test spies on `revertAll` and fixer `run` (a mutant that re-applies on any setting change now fails); e2e checks that a site excluded from sending stays fixed with the "on" tooltip. Verify `npm test` and `npm run test:e2e` pass.
- [x] 7.8 Content scripts use `window.Dostupno` like core.js (Firefox can differ from `globalThis`); docs fixed (proposal/design "one querySelector", `vm` wording, task 3.2 value); risks for DM overlays, Stripe over-blocking, closed shadow roots; roadmap Firefox check includes a page. Verify `npm run check` passes.

## Workflow follow-up

- Open a PR from `privacy-exclusions`; CI must pass.
- After merge, archive with `/openspec-archive-change privacy-exclusions`.
