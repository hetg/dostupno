# page-safety Specification

## Purpose
Guarantees that Доступно can never leave a website worse or broken: every change it makes is recorded and fully reversible, failures stay contained, and it works silently and fast.

## Requirements

### Requirement: All page changes are reversible
Every attribute, inline style or stylesheet the extension adds to a page SHALL be recorded with its original value so that turning the extension off restores the page exactly, without a reload.

#### Scenario: Turning off restores the original page
- **WHEN** fixers have changed attributes, inline styles and injected stylesheets on a page
- **AND** the user turns Доступно off for the site
- **THEN** every changed attribute and inline style returns to its original value (or is removed if it was absent)
- **AND** every injected stylesheet is removed
- **AND** no element keeps a `data-dostupno`, `data-dostupno-style` or `data-dostupno-needs-ai` marker

#### Scenario: Nothing changes after turning off
- **WHEN** the user turns Доступно off while deferred checks (for example, contrast checks waiting for text to scroll into view) are pending
- **THEN** no further change is made to the page until the user turns Доступно on again

### Requirement: Existing correct markup is never overridden
Fixers SHALL only fill in what is missing or broken and SHALL leave alone anything the site already provides correctly.

#### Scenario: Element already has a name
- **WHEN** a control already has a meaningful accessible name (from `aria-label`, `aria-labelledby`, a `<label>`, its text, or a labelled child)
- **THEN** the extension does not change its name

### Requirement: A failing fixer never breaks the page
An error in one fixer SHALL NOT stop other fixers, throw into the page, or break the page's own scripts.

#### Scenario: One fixer throws
- **WHEN** one fixer throws an error while processing a page
- **THEN** the error is logged to the console with the `[Доступно]` prefix
- **AND** the remaining fixers still run
- **AND** the page keeps working

### Requirement: Silent operation
The extension SHALL NOT show popups or make screen reader announcements about individual fixes. The only announcements are the on/off confirmations defined in the activation capability.

#### Scenario: Fixes are applied
- **WHEN** fixers change elements on a page
- **THEN** no visual notice is shown and nothing is announced to screen readers

### Requirement: New content is processed incrementally
Content added after page load (single-page apps, infinite scroll, popups) SHALL be fixed by processing only the newly added subtrees, batched shortly after they appear, never by re-scanning the whole page.

#### Scenario: Content added after load
- **WHEN** a page inserts new elements after the initial run
- **THEN** within about 300 ms of the insertion the fixers run on the new subtrees only
- **AND** elements already handled are not processed again
