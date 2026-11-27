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
- **THEN** fixers run on pages of that site as usual, except that no AI description is requested
- **AND** the toolbar icon shows Доступно as on for that site

#### Scenario: AI setting does not change fixing
- **WHEN** the user's `ai` setting changes from `false` to `true` or back
- **THEN** the same fixers run on open pages as before (the page is re-applied as described in "Changing what may be sent re-applies the page"), and only AI descriptions appear or disappear

## ADDED Requirements

### Requirement: Changing what may be sent re-applies the page
When the `ai` setting changes, or `privateSites` changes in a way that affects the current page's host, open pages where Доступно runs SHALL be reverted and fixed again with the new settings, without a reload and without any announcement. Changes to `privateSites` that don't affect a page SHALL leave that page untouched.

#### Scenario: Opting in
- **WHEN** the user ticks "Описувати зображення за допомогою ШІ" while a news page with flagged images is open
- **THEN** that page is fixed again and its flagged images near the viewport get descriptions without a reload

#### Scenario: Excluding another site
- **WHEN** the user adds `other.ua` to `privateSites` while a page of `news.site.ua` is open
- **THEN** the `news.site.ua` page is not reverted or re-run

#### Scenario: No announcement
- **WHEN** `ai` or `privateSites` changes
- **THEN** screen readers hear nothing from the page; only the popup control's own state is announced
