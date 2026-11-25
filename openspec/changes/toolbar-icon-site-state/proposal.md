# Proposal

## Why

The toolbar icon looks the same whether Доступно is on or off for the current site. After pressing Alt+Shift+D, or on a site turned off weeks ago, a sighted or low-vision user has to open the popup to know whether the page is being fixed. The on/off announcement only reaches screen reader users, and only at the moment of toggling.

## What Changes

- The toolbar icon shows the state on the current tab:
  - **On**: today's icon, a yellow "Д" on navy.
  - **Off for this site**: a grey "Д" with a diagonal slash. Grey alone would rely on colour, so the slash keeps the state visible in greyscale and for colour-blind users.
- The icon's tooltip, which screen readers announce on the toolbar button, says "Доступно: увімкнено на цьому сайті" or "Доступно: вимкнено на цьому сайті".
- The icon updates immediately when the site is toggled from the popup or with Alt+Shift+D, in every open tab of that site.
- Pages where Доступно can't run (browser pages, pages opened before install) keep the default icon and the tooltip "Доступно".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `extension-ui`: adds a requirement that the toolbar icon and its tooltip show whether Доступно is on for the current site.

## Non-goals

- Showing the number of fixes on the icon (badge text). It could be added later, but it would distract on every page and contradict "silent by default".
- Different icons per profile (screen reader / low vision).
- Animating the icon or announcing anything new on the page.
- Changing how the site toggle works.

## Principles

- **Never make a page worse / don't override the site / reversible**: no change to pages; the icon is browser chrome, outside the page.
- **Silent**: no page announcements are added. The tooltip is only read when the user focuses the toolbar button.
- **Accessible own UI**: the state is conveyed by shape (slash) and text (tooltip), not colour alone. Both icons keep high contrast against light and dark toolbars.
- **Privacy**: no new permissions. The state comes from the content script already running in the tab, so the extension doesn't need to read tab URLs.
- **Performance**: one small message per page load and per toggle.
- **Failures contained**: if the icon update fails, the page and the toggle still work.

## Impact

- `extension/icons/`: new `icon-off.svg` source and `icon-off-16.png` / `icon-off-32.png`, rendered by `npm run icons`.
- `extension/src/content.js`: reports "on" / "off" to the background when it activates or deactivates.
- `extension/src/background.js`: sets the tab's icon and tooltip from those reports, and resets them when a tab starts loading a new page.
- `scripts/make-icons.mjs`: renders the off icon too.
- Tests: `test/e2e-extension.mjs` checks the icon and tooltip state in the real extension.
- No new permissions or dependencies.
