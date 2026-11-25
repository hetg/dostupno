# image-alt Specification

## Purpose
Gives images a correct text alternative where it can be decided without AI, hides decorative images from screen readers, and flags the rest for the planned AI backend.

## Requirements

### Requirement: Decorative images are hidden from screen readers
Images without a real `alt` SHALL get `alt=""` when they are clearly decorative: tiny images (24 px or less in either dimension, such as spacers, tracking pixels and bullets) or images inside a link or button that already has text.

#### Scenario: Tracking pixel
- **WHEN** a loaded 1×1 image has no `alt`
- **THEN** it gets `alt=""`

#### Scenario: Image inside a text link
- **WHEN** an image without `alt` is inside a link whose text is "Black Friday"
- **THEN** the image gets `alt=""` and the link is announced by its text only

### Requirement: Captions and titles become alt text
An image without a real `alt` that has a `<figcaption>` in its `<figure>`, or a `title`, SHALL get that text (up to 200 characters) as `alt`.

#### Scenario: Figure with caption
- **WHEN** an image without `alt` is in a `<figure>` with caption "Відкриття нового укриття у школі №5"
- **THEN** its `alt` becomes "Відкриття нового укриття у школі №5"

### Requirement: File names are not treated as alt text
An `alt` that looks like a file name or camera default (`IMG_2041.jpg`, `photo.png`, `image`, `DSC 12`, `фото`) SHALL be treated as missing.

#### Scenario: Camera file name as alt
- **WHEN** an image has `alt="IMG_2041.jpg"` and no caption or title
- **THEN** it is marked `data-dostupno-needs-ai="alt"`

### Requirement: Unknown images are flagged, not guessed
Images whose alternative can't be decided without AI SHALL be marked `data-dostupno-needs-ai="alt"` and otherwise left unchanged.

#### Scenario: Content photo without alt
- **WHEN** a large image has no `alt`, caption or title and is not inside a text link
- **THEN** its `alt` stays absent and it is marked `data-dostupno-needs-ai="alt"`

#### Scenario: Image already described
- **WHEN** an image has a real `alt`, `alt=""`, `role="presentation"`/`"none"`, or is inside `aria-hidden="true"`
- **THEN** it is left untouched
