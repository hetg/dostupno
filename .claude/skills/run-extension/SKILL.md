---
name: run-extension
description: Run Доступно for real to see a change working - load the unpacked extension in Chromium, check the popup, or see what the fixers do on a specific website (with before/after pictures). Use when asked to run, try, screenshot or verify the extension beyond unit-style tests.
---

# Run the extension

Pick the smallest thing that answers the question.

## Real extension, end to end (about 10 s)
```bash
npm run test:e2e            # loads extension/ unpacked in Chromium, runs it on the fixture over http
SHOTS=1 npm run test:e2e    # also saves test/e2e-report/popup.png (Read it to look)
```
Checks: the service worker starts; content scripts fix the page (names from Chromium's
accessibility tree); turning the site off reverts live and is announced; the popup renders in
Ukrainian with named controls. To check something new in the real extension, add a check to
`test/e2e-extension.mjs` rather than writing a throwaway script.

## AI descriptions against the local backend
```bash
npm run db:local --prefix backend     # once: local D1 table
npm run dev --prefix backend          # http://localhost:8787, key from backend/.dev.vars
```
Load `extension/` unpacked, open its service worker console and run
`chrome.storage.local.set({ devBackendUrl: 'http://localhost:8787' })` (only unpacked installs honor
it). The popup then shows "Описи зображень"; tick it and open a public news page. Every image
described is a real, paid model call (fractions of a cent): ask the user before doing this. The e2e
test covers the same flow against `test/mock-backend.mjs` for free.

## What it does on a real website
```bash
SHOTS=1 npm run audit -- https://site.ua/                 # every change, before/after pictures
SHOTS=1 npm run audit -- --compare main https://site.ua/  # only what your branch changes
```
Results in `test/audit-report/` (`<host>.json`, `<host>.png`, `compare.md`). For many sites or a
full review, use the `audit-triage` subagent so the raw data stays out of the main conversation.
Only public pages: never banking, mail, Diia or medical sites.

## Interactive browsing
The project's `playwright` MCP server (`.mcp.json`) can open pages and read their accessibility
snapshots. It doesn't load the extension; use it to understand a site's markup.

## For the user to try by hand
- Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/`
- Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `extension/manifest.json`
- Screen reader checks (NVDA on Windows, VoiceOver on Mac with Cmd+F5) can't be automated:
  say what to listen for and ask the user.
