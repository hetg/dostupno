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

### 1. The tab reports its own state (push), the background confirms after loads (pull)
- **Push**: the content script sends `{ type: 'dostupno:state', active }` to the background in `apply()` on start and whenever the running state changes (site toggled, global `enabled` changed). The background sets the icon and title for `sender.tab.id`.
- **Pull**: on `tabs.onUpdated` with `changeInfo.status === 'complete'`, the background sends the existing `dostupno:status` message to that tab and sets the icon from the reply. If there's no reply (browser page, page opened before install, content script not injected yet), it sets the default icon and the tooltip "Доступно". `changeInfo.status` is available without the `tabs` permission.
- The pull covers cases the push misses: back/forward-cache restores and same-document navigations, where the content script doesn't run again, and a stale off icon after navigating to another site. When the content script loads after the `complete` event, its own push corrects the default icon.
- **Alternative considered**: read `tab.url` in the background and compare the host with `disabledSites`. Rejected: it needs the `tabs` permission or host permissions (a new install warning). It also reports "on" for pages where the content script isn't actually running.

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
- [A short flicker to the default icon when a disabled site finishes loading before the content script reports] → The pull happens at `complete`, and the content script runs at `document_idle` right after. Any flicker lasts a fraction of a second and only on disabled sites.
- [Firefox differences in `action.setIcon` with `tabId`] → Supported in Firefox MV3 (121+). Verify by hand in Firefox, since automated e2e runs only in Chromium.
- [A grey icon could look "disabled by the browser"] → The slash and the tooltip text make it read as "Доступно is off here", which is the intent.
