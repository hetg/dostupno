# Design

## Context

The action icon is set once in `manifest.json` (`action.default_icon`) and never changes. Per-site state lives in `chrome.storage.sync.disabledSites`. The content script (`src/content.js`) decides whether to run with `shouldRun()` (global `enabled` and host not in `disabledSites`), activates or deactivates on storage changes, and already answers a `dostupno:status` message with `{ active }`. The extension has only the `storage` and `activeTab` permissions, so the background script cannot read the URL of arbitrary tabs.

## Goals / Non-Goals

**Goals:**
- The icon always matches what the content script in that tab is actually doing, not a guess from the URL.
- No new permissions.

**Non-Goals:**
- Showing state for tabs where no content script runs, beyond the default icon (see the extension-ui delta spec).

## Decisions

### 1. Pages report their own state; the browser resets icons on navigation
The page sends `{ type: 'dostupno:state', active }` and the background sets the icon and title for `sender.tab.id`. There are four reports:
- **Early:** `src/early-state.js`, a separate content script at `document_start`, reads `enabled` and `disabledSites` and reports right away. A disabled site therefore shows "off" while the page is still loading, not only at `document_idle` (which can be seconds on heavy pages). It touches nothing on the page.
- **Settled:** `content.js` reports in `apply()` and whenever its running state changes (site toggled, global `enabled` changed).
- **Back/forward cache:** `content.js` reports again on `pageshow` with `persisted`. The browser reset the icon on that navigation, but the content scripts don't run again.
- **Prerender:** nothing is reported while `document.prerendering`. `content.js` reports on `prerenderingchange`, when the page is shown.

Chromium resets tab-specific action icons and titles on every cross-document navigation. We verified this: the e2e navigation checks pass with no reset code in the background. So pages without a content script (browser pages, opened before install) show the manifest default without any help.

**Alternatives considered:**
- **Pull after each load** (`tabs.onUpdated` `complete` → ask the tab): this was the first implementation. Review found a race: the tab could answer "off" before it had read storage, flashing the grey icon on sites that are on. It also woke the background on every tab update in the browser. Dropped once the navigation reset was confirmed.
- **Read `tab.url` in the background and compare with `disabledSites`:** needs the `tabs` permission or host permissions (a new install warning), and reports "on" for pages where the content script isn't actually running.

### 2. Per-tab icon and title, never the global default
`chrome.action.setIcon({ tabId, path })` and `chrome.action.setTitle({ tabId, title })` only. The manifest default (the on icon, tooltip "Доступно") stays the fallback, so an extension restart or a failed message can never leave every tab showing "off".

### 3. Off icon design
A separate source `extension/icons/icon-off.svg`, rendered to 16 and 32 px by `scripts/make-icons.mjs`:
- **Shape**: the same "Д" shape as the on icon, so it reads as the same extension.
- **Colours**: a mid-grey rounded square (`#5f6368`) with a light-grey letter (`#e8eaed`).
- **Slash**: a light diagonal slash from top-left to bottom-right, with a dark outline so it stays visible on light and dark toolbars and at 16 px.

Store icons (48/128) stay the on version. The welcome page and store listing always show the extension as on.

### 4. Failures stay contained
Every `setIcon`/`setTitle`/`sendMessage` call is wrapped and its rejection ignored. Tabs can close between the event and the call, and an icon error must never stop the toggle or throw inside the page. The content script's push is fire-and-forget: if the service worker is asleep, the message wakes it. If sending fails (extension reloaded), the page is unaffected.

## DOM changes and revert

None. The icon and tooltip are browser chrome, not page DOM, so the change log and `revertAll()` are untouched. Turning a site off still reverts the page exactly as before. The icon change is a side effect of the same state transition.

## Performance

One message per page load (push), one per `complete` event (pull), and one per toggle per open tab of that site. Nothing scales with page size, and there's no DOM scanning.

## Risks / Trade-offs

- [Icon shows "on" (default) on a page opened before install, where Доступно isn't running] → Accepted: the popup already tells the user to reload ("Оновіть сторінку, щоб Доступно почав працювати."). A third "inactive" icon would add a state users must learn for a rare case.
- [Default ("on"-looking) icon on a disabled site between the navigation and the early report] → Only the time it takes `document_start` to read synced storage, usually milliseconds. The e2e checks "off" on a page held loading for 3 s.
- [Back/forward cache and prerender can't be tested in automation (Playwright's Chromium may disable the cache)] → Both are on the manual checklist.
- [The test and audit harnesses inject only `content_scripts[0]`] → `early-state.js` is a second entry, so they're unaffected. It only matters in the real extension, which the e2e loads.
- [Firefox differences in `action.setIcon` with `tabId`] → Supported in Firefox MV3 (121+). Verify by hand in Firefox, since automated e2e runs only in Chromium.
- [A grey icon could look "disabled by the browser"] → The slash and the tooltip text make it read as "Доступно is off here", which is the intent.
