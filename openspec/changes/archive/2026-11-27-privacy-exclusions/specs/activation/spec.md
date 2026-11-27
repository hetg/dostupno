# Spec Delta

## MODIFIED Requirements

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
