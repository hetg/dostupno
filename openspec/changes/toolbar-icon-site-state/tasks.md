# Tasks

## 1. Off icon

- [x] 1.1 Add `extension/icons/icon-off.svg`: the same "Д" shape on a `#5f6368` rounded square with a `#e8eaed` letter, plus a light diagonal slash outlined in dark. Extend `scripts/make-icons.mjs` to also render `icon-off-16.png` and `icon-off-32.png`. Verify with `npm run icons` that both PNGs exist, then view them next to the on icons on light and dark backgrounds; at 16 px the slash must be visible, and the two must differ in greyscale.

## 2. State reporting and icon updates

- [x] 2.1 In `extension/src/content.js`, send `{ type: 'dostupno:state', active }` to the background from `apply()` and whenever the running state changes in the `storage.onChanged` handler. Wrap the send so a failure (extension reloaded, worker gone) is ignored. Verify with `npm test` that all checks still pass, and `npm run lint`.
- [x] 2.2 In `extension/src/background.js`, handle `dostupno:state` by calling `chrome.action.setIcon` and `chrome.action.setTitle` for `sender.tab.id`: on → the default icons and "Доступно: увімкнено на цьому сайті"; off → the off icons and "Доступно: вимкнено на цьому сайті". On `tabs.onUpdated` with `status === 'complete'`, ask the tab for `dostupno:status` and set the icon from the reply, or the default icon and "Доступно" if there's no reply. Ignore errors from closed tabs. Verify with `npm run lint`.
- [x] 2.3 Extend `test/e2e-extension.mjs` (real extension): on the fixture page, check the action title for the tab is "Доступно: увімкнено на цьому сайті". Read it from the service worker with `chrome.action.getTitle({ tabId })`. After adding the host to `disabledSites`, check it becomes "Доступно: вимкнено на цьому сайті" within a second. After removing it, check it's "on" again. Check that a second tab of the same site follows the toggle, and that an `about:blank` tab keeps "Доступно". Verify with `npm run test:e2e`.
- [x] 2.4 Update `CLAUDE.md` (architecture lines for `content.js`, `background.js` and `icons/`) to describe the state message and the off icon. Verify the descriptions match the code.

## 3. Integration

- [x] 3.1 Run `npm run check` and verify it passes. Fixer behavior doesn't change, so no real-site audit is needed.
- [ ] 3.2 Manual check for the user, in Chrome and in Firefox (temporary add-on):
  - Press Option+Shift+D on a site and see the icon switch to the grey slashed "Д" in all tabs of that site, then back.
  - With VoiceOver (Cmd+F5), focus the toolbar button and hear "Доступно: вимкнено на цьому сайті" / "увімкнено".
  - Check that a browser settings page shows the default icon.

  Record the result in the PR description.

## Workflow follow-up

- Archive the change after the PR is merged (`/openspec-archive-change`), which merges the delta into `openspec/specs/extension-ui/spec.md`.
