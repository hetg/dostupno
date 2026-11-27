# activation Specification

## Purpose
Controls when Доступно runs: globally, per site, and per user profile, with a keyboard shortcut and screen reader confirmation when the state of a site changes.

## Requirements

### Requirement: Runs on every site by default
Доступно SHALL run on every web page unless the user has turned it off for that site. Settings are stored in synced browser storage as `{ enabled, profiles: { screenreader, lowvision }, disabledSites, ai, privateSites }`, defaulting to enabled, screen reader profile on, low-vision profile off, no disabled sites, `ai: false` and `privateSites: []`.

#### Scenario: Fresh install
- **WHEN** the user opens any website after installing the extension
- **THEN** the page-language fix and the screen reader fixes (image alt text, control names, form labels) run on that page
- **AND** low-vision fixers (contrast, focus) do not run

#### Scenario: Site turned off
- **WHEN** a site's hostname is in `disabledSites`
- **THEN** no fixer runs on pages of that site

#### Scenario: Site excluded from sending only
- **WHEN** a site's hostname is in `privateSites` but not in `disabledSites`
- **THEN** fixers run on pages of that site as usual
- **AND** the toolbar icon shows Доступно as on for that site

#### Scenario: AI setting does not change fixing
- **WHEN** the user's `ai` setting changes from `false` to `true` or back
- **THEN** the same fixers run on open pages as before, and nothing is reverted or re-applied

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
Each fixer SHALL declare the profiles it serves (`all`, `screenreader`, `lowvision`). A fixer runs when any of its profiles is active; `all` is always active. The page-language fixer SHALL serve `all`; the image alt text, control-name and form-label fixers SHALL serve `screenreader` only; the contrast and focus fixers SHALL serve `lowvision` only. Changing profiles SHALL revert the page and re-run the fixers from a clean state.

#### Scenario: Screen reader profile turned off
- **WHEN** the user unticks "Я користуюсь скрінрідером" while a page is open
- **THEN** names, labels and alt text added by Доступно disappear from that page without a reload
- **AND** no element keeps a `data-dostupno-needs-ai` marker
- **AND** the page-language fix stays applied

#### Scenario: Screen reader profile off on a new page
- **WHEN** the screen reader profile is off and the user opens a page with an icon-only button, an unlabeled field and an image without `alt`
- **THEN** those elements are left untouched: no `aria-label`, no `alt`, no `data-dostupno-needs-ai`
- **AND** a missing `<html lang>` is still filled in

#### Scenario: Screen reader profile turned back on
- **WHEN** the user ticks "Я користуюсь скрінрідером" again
- **THEN** open pages get their names, labels and alt text back without a reload

#### Scenario: No profile ticked
- **WHEN** both "Я користуюсь скрінрідером" and "Я погано бачу" are unticked
- **THEN** only the page-language fix runs, and the popup reports its count as usual ("На цій сторінці нічого не довелося виправляти." when there was nothing to fix)

#### Scenario: Low-vision profile enabled
- **WHEN** the user turns on the low-vision profile
- **THEN** open pages are reverted and fixed again, now including the contrast and focus fixers

#### Scenario: Low-vision profile disabled
- **WHEN** the user turns off the low-vision profile
- **THEN** contrast and focus changes disappear from open pages
- **AND** changes from the other active profiles are re-applied
