# focus-visibility Specification

## Purpose
For the low-vision profile, makes the keyboard focus position visible on every site, including sites that removed the focus outline.

## Requirements

### Requirement: Visible focus ring on any background
With the low-vision profile on, elements focused from the keyboard (`:focus-visible`) SHALL show a two-tone ring: a 3 px near-black outline offset by 2 px plus a yellow (#ffd400) outer ring, overriding site styles that hide focus.

#### Scenario: Site removes outlines
- **WHEN** a site sets `*:focus { outline: none }` and the user presses Tab
- **THEN** the focused element shows the dark outline and yellow ring

#### Scenario: Mouse click
- **WHEN** the user clicks a button with the mouse
- **THEN** the browser's `:focus-visible` rules decide whether a ring shows, so mouse users don't get rings on every click

#### Scenario: Low-vision profile off
- **WHEN** the low-vision profile is off
- **THEN** no focus style is injected and the site's own focus styles apply
