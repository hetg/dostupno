# text-contrast Specification

## Purpose
For the low-vision profile, raises text contrast to WCAG AA with the smallest visible change, while refusing to touch any text whose real background can't be known.

## Requirements

### Requirement: Low-contrast text reaches WCAG AA
With the low-vision profile on, visible text below WCAG AA (4.5:1, or 3:1 for text at least 24 px, or bold and at least 18.66 px) SHALL be moved just past the target with the smallest possible color change.

#### Scenario: Pale gray text on white
- **WHEN** text colored #b5b5b5 is shown on a white background
- **THEN** its color is darkened just enough to reach at least 4.5:1

#### Scenario: Dark gray text on a black box
- **WHEN** text colored #555 is shown on #1c1c1c
- **THEN** its color is lightened just enough to reach at least 4.5:1

#### Scenario: Text already passes
- **WHEN** text already meets its target ratio
- **THEN** it is left untouched

### Requirement: The design's polarity is kept
Dark text SHALL only get darker and light text only lighter. When light text can't reach the target even as pure white, the text keeps its color and the single small element behind it (at most 400×300 px, not the page body, with only light text inside) SHALL get a darker background instead. Otherwise the text is left untouched.

#### Scenario: White text on a mid-green button
- **WHEN** a button with background rgb(0, 160, 70) has white text (about 3.4:1)
- **THEN** the text stays white
- **AND** the button background is darkened just enough to reach 4.5:1

#### Scenario: Large area behind light text
- **WHEN** light text can't reach the target and the background belongs to a large section or the page body
- **THEN** nothing is changed

### Requirement: Only text with a known background is changed
The background SHALL be determined from what is actually painted under the text on screen. Text SHALL be left untouched when that is unknown or doubtful.

#### Scenario: Text over an image
- **WHEN** text sits on top of an image, video, canvas, background image, gradient, filter, blend mode, or a positioned pseudo-element with a background
- **THEN** it is left untouched

#### Scenario: Text covered or hidden
- **WHEN** text is hidden, transparent, covered by another painted element, or smaller than 4×4 px (screen-reader-only text)
- **THEN** it is left untouched

#### Scenario: Near-invisible ratio
- **WHEN** the computed ratio is below 1.5:1
- **THEN** the text is left untouched, because the real background must differ from the computed one

#### Scenario: Colors mid-transition
- **WHEN** the text or its background is running an animation or transition
- **THEN** the check is retried a few times shortly after, and the text is left untouched if it is still animating

### Requirement: Only on-screen text is checked
Text SHALL be checked when it scrolls into view, not on page load.

#### Scenario: Text far down the page
- **WHEN** low-contrast text is below the visible area
- **THEN** it is unchanged until the user scrolls to it
- **AND** it is fixed once it becomes visible
