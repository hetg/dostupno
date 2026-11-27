# Backend

A Cloudflare Worker that writes Ukrainian alt text for public images with Claude Haiku 5.5.
**Local only for now:** change 3 adds rate limiting, creates the D1 database and deploys it.
Until then release builds of the extension have no backend address and show no AI controls.

## Why a backend
- Users never handle API keys.
- Shared cache: the first visitor pays for the AI call, everyone after gets the result instantly.
- Later: crowd corrections ("report a wrong label") will beat AI output.

## API

`POST /v1/describe` (CORS open, no credentials; `OPTIONS` answers the preflight)
```json
{
  "pageHost": "news.site.ua",
  "lang": "uk",
  "items": [
    { "imageUrl": "https://cdn.site.ua/img/a.jpg", "context": "nearby caption or heading, ≤ 300 chars" }
  ]
}
```
1–8 items, body ≤ 16 KB, no other fields (anything else is a 400). Response, one result per item
in order:
```json
{ "results": [ { "alt": "Діти саджають дерева біля школи", "decorative": false, "source": "ai" } ] }
```
`source`: `ai`, `cache`, `refused` (privacy rules) or `none` (unsupported image, fetch or model
failure). `alt` is `null` whenever there's no description; the extension then leaves the image as it was.

## Rules
- Never accept page HTML or full page URLs: only the page **host**, the image URL and a short
  context string. The extension sends nothing else (`extension/src/background.js`).
- Privacy: the Worker imports `extension/src/privacy.js` itself (`src/privacy.js`), so it applies
  exactly the extension's rules. A private or non-public `pageHost` refuses every item; each
  `imageUrl` must pass `mayShareUrl`, and so must every redirect while fetching.
- Images are fetched by the Worker (8 s timeout, ≤ 5 MB, ≤ 3 redirects, JPEG/PNG/GIF/WebP decided
  from the bytes), then sent to the model as base64.
- Model: `claude-haiku-5-5`, low effort, JSON output `{ decorative, alt }`. One Ukrainian sentence,
  ≤ 150 chars, no "Зображення/Фото" prefix, text in the image transcribed, people never identified
  from their appearance. Refusals, errors or odd output → `alt: null`, never invented text.
  The extension adds the "ШІ: " prefix when applying.
- Cache (D1 `descriptions`): key = sha256(`PROMPT_VERSION|MODEL|imageUrl`). Successes never
  expire (bump `PROMPT_VERSION` in `src/model.js` after prompt changes); unsupported images are
  cached for a day; refusals and errors aren't cached.
- The API key lives only in Worker secrets (`backend/.dev.vars` locally, git-ignored) and never
  appears in responses or logs.

## Layout
```
src/index.js        routing, CORS, size limit → describe()
src/describe.js     validation, privacy, cache, fetch, model (dependencies injected)
src/fetch-image.js  safe image fetching
src/model.js        the only Anthropic SDK code; prompt; output cleaning
src/cache.js        D1 cache + in-memory cache for tests
src/privacy.js      re-exports extension/src/privacy.js
migrations/         D1 schema
test/               node:test, no network or key needed
scripts/eval-alt.mjs  paid quality check on real sites (dry run unless --yes)
```

## Run
```bash
npm ci --prefix backend
npm test --prefix backend              # unit tests, free
npm run db:local --prefix backend      # once: create the local D1 table
npm run dev --prefix backend           # http://localhost:8787 with the key from backend/.dev.vars
```
Point an unpacked extension at it from its service worker console:
`chrome.storage.local.set({ devBackendUrl: 'http://localhost:8787' })`.
