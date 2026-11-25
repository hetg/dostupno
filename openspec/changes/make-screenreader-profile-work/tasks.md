# Tasks

## 1. Put the label fixers under the screen reader profile

- [x] 1.1 Change `profiles` from `['all']` to `['screenreader']` in `extension/src/fixers/images.js`, `names.js` and `forms.js`; leave `lang.js` on `['all']`. Verify with `grep -n "profiles:" extension/src/fixers/*.js` (lang = all; images, names, forms = screenreader; contrast, focus = lowvision).
- [x] 1.2 In `test/run-fixers.mjs`, add a second pass on a fresh page of `test/fixtures/broken.html` with `profiles: { screenreader: false, lowvision: false }`. Check that no element has an `aria-label` added by Доступно, the icon buttons/links and unlabeled fields have no meaningful name in Chromium's accessibility tree, no `data-dostupno-needs-ai` markers exist, and `<html lang>` is `uk`. Verify the existing full-profile checks still pass with `npm test`.
- [x] 1.3 In the same test, toggle the profile live: start with the screen reader profile on, flip it off through the storage shim, and check the labels and AI markers are gone while `lang` stays; flip it on and check the names come back (for example the logo link reads "Головна сторінка"). Verify with `npm test`.
- [x] 1.4 In `test/e2e-extension.mjs`, set `profiles.screenreader` to `false` in the real extension's storage and check the logo link loses its name and `lang` stays; set it back to `true` and check "Головна сторінка" returns. Verify with `npm run test:e2e`.
- [x] 1.5 Update the fixer list in `CLAUDE.md` so each fixer shows its profile (lang: all; images, names, forms: screenreader; contrast, focus: lowvision). Verify the list matches `grep -n "profiles:" extension/src/fixers/*.js`.

## 2. Check nothing else moved

- [ ] 2.1 Run `npm run audit -- --compare main` (the audit runs with both profiles on) and verify `test/audit-report/compare.md` shows 0 new and 0 gone changes and 0 revert leftovers on every site that loads. Anything else means fixer behavior changed by accident.
- [x] 2.2 Run `npm run check` (lint, smoke test, e2e, `openspec validate --all --strict`) and verify it passes.
- [ ] 2.3 Manual check for the user, by hand in Chrome with the extension loaded: untick "Я користуюсь скрінрідером" in the popup on a site with icon buttons (for example comfy.ua), then confirm with VoiceOver (Cmd+F5) that icon buttons are announced without Доступно's names, and that ticking it again brings the names back without a reload. Record the result in the PR description.

## Workflow follow-up

- Archive the change after the PR is merged (`/openspec-archive-change`), which merges the delta into `openspec/specs/activation/spec.md`.
