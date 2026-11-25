# activation Specification

## Purpose
Controls when Доступно runs: globally, per site, and per user profile, with a keyboard shortcut and screen reader confirmation when the state of a site changes.

## Requirements

### Requirement: Runs on every site by default
Доступно SHALL run on every web page unless the user has turned it off for that site. Settings are stored in synced browser storage as `{ enabled, profiles: { screenreader, lowvision }, disabledSites }`, defaulting to enabled, screen reader profile on, low-vision profile off, and no disabled sites.

#### Scenario: Fresh install
- **WHEN** the user opens any website after installing the extension
- **THEN** all fixers for the `all` profile run on that page
- **AND** low-vision fixers do not run

#### Scenario: Site turned off
- **WHEN** a site's hostname is in `disabledSites`
- **THEN** no fixer runs on pages of that site

### Requirement: Per-site toggle with keyboard shortcut
The user SHALL be able to turn Доступно off and on for the current site with **Alt+Shift+D** or from the popup, without reloading the page.

#### Scenario: Turning a site off with the shortcut
- **WHEN** the user presses Alt+Shift+D on a site where Доступно is on
- **THEN** the site is added to `disabledSites`
- **AND** all changes on open pages of that site are reverted
- **AND** screen readers hear "Доступно вимкнено на цьому сайті"

#### Scenario: Turning a site back on
- **WHEN** the user presses Alt+Shift+D on a site where Доступно is off
- **THEN** the site is removed from `disabledSites`
- **AND** fixers run on the open page
- **AND** screen readers hear "Доступно увімкнено на цьому сайті"

### Requirement: Profiles select which fixers run
Each fixer SHALL declare the profiles it serves (`all`, `screenreader`, `lowvision`). A fixer runs when any of its profiles is active; `all` is always active. Changing profiles SHALL revert the page and re-run the fixers from a clean state.

#### Scenario: Low-vision profile enabled
- **WHEN** the user turns on the low-vision profile
- **THEN** open pages are reverted and fixed again, now including the contrast and focus fixers

#### Scenario: Low-vision profile disabled
- **WHEN** the user turns off the low-vision profile
- **THEN** contrast and focus changes disappear from open pages
- **AND** changes from `all`-profile fixers are re-applied
