# Roadmap

## Weekend 1 — extension without AI ✅ (skeleton done)
- [x] Fixers: lang, images (non-AI), button/link names, form labels, contrast, focus ring
- [x] Revert everything on toggle off; Alt+Shift+D shortcut
- [x] Popup and welcome page in Ukrainian, accessible
- [x] Smoke test with Playwright
- [x] Test on 10–20 real Ukrainian sites (government, hromada, shops, news); collect false positives
      (`npm run audit`, 22 sites. Fixed: contrast turned white button text dark, example
      placeholders used as labels, "close-search" named "Пошук", names overriding a labelled child)
- [x] Test with NVDA (Windows) and VoiceOver
- [x] Icons (16/32/48/128) for the toolbar and store

## Weekend 2 — backend with AI
- [x] Backend endpoint: alt text for an image URL (Claude Haiku 5.5, Ukrainian, with page context)
      (`backend/`, Cloudflare Worker, runs locally with `wrangler dev`)
- [ ] Endpoint: name for an unnamed control (icon/svg + context)
- [x] Shared cache keyed by image URL hash (+ prompt and model version), D1
- [x] Extension: send only elements in or near the viewport; batch requests (`ai-images` fixer)
- [x] Privacy gate: built-in exclusion list (banks, Diia, mail, medical, …), non-public hosts, signed URLs,
      pages with password/card fields, user exclusions (`privateSites`), AI opt-in (`ai`, off by default)
      (`extension/src/privacy.js`; the backend imports the same file)
- [x] Popup: AI opt-in toggle and "don't send from this site" switch (shown only with a backend address)
- [x] No full-page uploads: only item URLs, the page host and short context reach the backend
- [x] `data_collection_permissions`: optional `websiteContent` + `browsingActivity`, asked when the user opts in
- [x] Quality check of AI alt text on real images (`backend/scripts/eval-alt.mjs`): two rounds on 20 images
      from `test/sites.txt`, prompt tuned to v3 (one sentence, logos, watermarks, exact text)
- [ ] Change 3: rate limiting per install, create the D1 database, deploy (scoped Cloudflare token),
      set `BACKEND_URL` so release builds show the AI controls (see the design's "Notes for change 3":
      Worker CPU limit vs image size, subrequests, auth for the open endpoint)

## Weekend 3 — trust and control
- [ ] "Report a wrong label" shortcut → backend → corrections override AI in the shared cache
- [ ] Heading structure fixer (missing h1, skipped levels) — careful, high risk of making things worse
- [ ] Landmarks (main, nav) when obviously missing
- [ ] Shadow DOM support

## Weekend 4 — real users
- [ ] Test sessions with blind and low-vision users (Access Lab, УТОС)
- [ ] Firefox for Android build and test with TalkBack
- [ ] Desktop Firefox: ticking "Описувати зображення за допомогою ШІ" asks for data-collection consent;
      declining leaves it off; revoking it in about:addons stops sending
- [ ] Desktop Firefox: load via `about:debugging`, check the background console has no errors and
      `Dostupno.privacy.mayShareFrom('https://privatbank.ua/', {ai:true, privateSites:[]})` is `false`;
      on any web page, the content-script console has `Dostupno.privacy` too (and no errors)
- [ ] Publish to Chrome Web Store and Firefox Add-ons

## Later
- Safari (iOS) via Safari Web Extension
- "Simplify this text" (plain Ukrainian) for cognitive accessibility
- Dyslexia-friendly spacing profile
