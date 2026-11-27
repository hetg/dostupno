# Spec Delta

## MODIFIED Requirements

### Requirement: Unknown images are flagged, not guessed
Images whose alternative can't be decided without AI SHALL be marked `data-dostupno-needs-ai="alt"` and otherwise left unchanged, unless an AI description is applied to them as described in "Flagged images get AI descriptions when allowed".

#### Scenario: Content photo without alt
- **WHEN** a large image has no `alt`, caption or title and is not inside a text link
- **THEN** its `alt` stays absent and it is marked `data-dostupno-needs-ai="alt"`

#### Scenario: Image already described
- **WHEN** an image has a real `alt`, `alt=""`, `role="presentation"`/`"none"`, or is inside `aria-hidden="true"`
- **THEN** it is left untouched

## ADDED Requirements

### Requirement: Flagged images get AI descriptions when allowed
When the screen reader profile is on, the user opted in to AI descriptions and the privacy gate allows the page and the image URL, an image flagged `data-dostupno-needs-ai="alt"` that comes within about one screen of the viewport SHALL be described. It gets `alt="ШІ: <description>"`, or `alt=""` when the description says it is decorative, and loses its flag.

#### Scenario: News photo scrolled into view
- **WHEN** AI descriptions are on and a flagged photo on a public news page comes near the viewport
- **THEN** within a few seconds its `alt` becomes like "ШІ: Діти саджають дерева біля школи"
- **AND** it no longer has `data-dostupno-needs-ai`

#### Scenario: Decorative verdict
- **WHEN** the description for a flagged image says it is decorative
- **THEN** the image gets `alt=""` without the prefix

### Requirement: Nothing is requested when AI descriptions aren't allowed
No description SHALL be requested, and flagged images SHALL stay as they are, when AI descriptions are off, the screen reader profile is off, the privacy gate refuses the page or the image URL, or no backend address is configured.

#### Scenario: AI off (default)
- **WHEN** a page has flagged images and the user never opted in
- **THEN** no request leaves the browser and the images keep their flag and no `alt`

#### Scenario: Private page
- **WHEN** AI descriptions are on and the page shows a password field
- **THEN** no request is made for that page's images

#### Scenario: Screen reader profile off
- **WHEN** AI descriptions are on but "Я користуюсь скрінрідером" is unticked
- **THEN** nothing is requested

#### Scenario: Images far below the fold
- **WHEN** a long page has flagged images far below the visible area
- **THEN** they are not requested until the user scrolls near them

### Requirement: Only content images are described
Images rendered or loaded smaller than 24 pixels in either direction, images in the site header or navigation, avatars and profile pictures, and images that already have an ARIA name SHALL NOT be sent. An image that is still loading, or shows a `data:` placeholder, SHALL be considered again once its real picture loads.

#### Scenario: Tracking pixel
- **WHEN** a flagged 1×1 image is on the page
- **THEN** it is never sent

#### Scenario: Lazy-loaded photo
- **WHEN** a flagged image shows a placeholder and later loads its real picture
- **THEN** the real picture is described

### Requirement: Descriptions follow the picture
If the site later shows a different picture in an image that has an AI description (gallery, carousel, recycled list item), the description SHALL be withdrawn and the image flagged again, so it can be described anew.

#### Scenario: Gallery thumbnail clicked
- **WHEN** the main gallery image with `alt="ШІ: …"` switches to another photo
- **THEN** the old description is gone and the new photo is described

### Requirement: AI descriptions never overwrite the site
An AI description SHALL be applied only if, at the moment it arrives, the image is still in the page, still flagged and still has no real `alt`. Otherwise it is dropped.

#### Scenario: Site adds alt meanwhile
- **WHEN** the site sets `alt="Мер міста на відкритті"` on a flagged image while its description is in flight
- **THEN** the site's `alt` is kept and the AI description is dropped

### Requirement: Failed descriptions leave the image unchanged
When the backend gives no description for an image (refused, unsupported, failed, timed out or unreachable), the image SHALL keep its flag and no `alt`, and SHALL NOT be requested again during the same page view.

#### Scenario: Backend unreachable
- **WHEN** AI descriptions are on but the backend can't be reached
- **THEN** flagged images stay flagged with no `alt`, and the page keeps working

### Requirement: AI descriptions are reversible
AI descriptions SHALL be applied and reverted like every other fix. Turning Доступно off on the site, turning the screen reader profile off, or turning AI descriptions off SHALL restore the images' original state, and answers arriving after that SHALL be ignored.

#### Scenario: Turning AI off
- **WHEN** images have AI descriptions and the user unticks "Описувати зображення за допомогою ШІ"
- **THEN** those images lose the "ШІ: …" `alt` without a reload and are flagged again
- **AND** no request is made for them

#### Scenario: Late answer after turning off
- **WHEN** the user turns Доступно or AI descriptions off on the site while a request is in flight
- **THEN** the answer, when it arrives, changes nothing on the page
