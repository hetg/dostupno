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
- [ ] Backend endpoint: alt text for an image URL (vision LLM, Ukrainian, with page context)
- [ ] Endpoint: name for an unnamed control (icon/svg + context)
- [ ] Shared cache keyed by image URL hash / site + selector, so repeat visits are instant and cheap
- [ ] Extension: send only elements in or near the viewport; batch requests
- [ ] Privacy: built-in exclusion list (banks, Diia, mail, medical), user exclusions, no full-page uploads
- [ ] Update `data_collection_permissions` in manifest.json (now `none`) once image URLs are sent to the backend
- [ ] Rate limiting per install

## Weekend 3 — trust and control
- [ ] "Report a wrong label" shortcut → backend → corrections override AI in the shared cache
- [ ] Heading structure fixer (missing h1, skipped levels) — careful, high risk of making things worse
- [ ] Landmarks (main, nav) when obviously missing
- [ ] Shadow DOM support

## Weekend 4 — real users
- [ ] Test sessions with blind and low-vision users (Access Lab, УТОС)
- [ ] Firefox for Android build and test with TalkBack
- [ ] Publish to Chrome Web Store and Firefox Add-ons

## Later
- Safari (iOS) via Safari Web Extension
- "Simplify this text" (plain Ukrainian) for cognitive accessibility
- Dyslexia-friendly spacing profile
