# Доступно

Browser extension that makes any website easier to use for screen reader and low-vision users.
Install once, choose what helps you, and every site gets better automatically. Ukrainian-first.

## Try it
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the `extension/` folder.
2. Open `test/fixtures/broken.html` (allow "file URLs" access in the extension details), or any website.
3. Click the extension icon to see what was fixed. **Alt+Shift+D** turns it off/on for the current site.

## Develop
```bash
npm install
npx playwright install chromium
npm test          # smoke test on test/fixtures/broken.html
npm run audit     # run the fixers on real Ukrainian sites, report every change
```
See `CLAUDE.md` for architecture and principles, and `docs/ROADMAP.md` for the plan.
