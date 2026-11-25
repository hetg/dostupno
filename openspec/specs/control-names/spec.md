# control-names Specification

## Purpose
Gives icon-only buttons and links a short, correct Ukrainian name so screen reader users hear what a control does instead of "button" or a long URL.

## Requirements

### Requirement: Unnamed controls get a name
Links, buttons, `role="button"`/`"link"` elements and submit/image inputs with no accessible name, or a name made only of symbols ("×", "☰", "→"), SHALL get an `aria-label` (or `alt` for image inputs). Sources, best first: `title`; a known symbol; `tel:`/`mailto:` target; the text of another link to the same URL (a headline wins); a known social or video domain; a submit button in a search form; icon class names and SVG `<use>` references; a link to the site's home page.

#### Scenario: Icon symbols
- **WHEN** a button's only content is "×", "☰" or "🔍"
- **THEN** it is named "Закрити", "Меню" or "Пошук" respectively

#### Scenario: Phone and e-mail links
- **WHEN** an icon-only link points to `tel:+380441234567`
- **THEN** it is named "Зателефонувати +380441234567"
- **AND** a `mailto:info@site.ua` link is named "Написати на info@site.ua"

#### Scenario: Card image link with a headline
- **WHEN** an image-only link points to `/news/2` and a headline link to `/news/2` reads "Ремонт дороги на вулиці Шевченка"
- **THEN** the image link is named "Ремонт дороги на вулиці Шевченка"
- **AND** if the icon link has a play or video icon, it is named "Відео: " followed by the headline

#### Scenario: Social and video links
- **WHEN** an icon-only link points to facebook.com, instagram.com, t.me, tiktok.com, viber or x.com/twitter.com
- **THEN** it is named "Facebook", "Instagram", "Telegram", "TikTok", "Viber" or "X (Twitter)"
- **AND** a link to a YouTube video (`/watch`, `/shorts`, youtu.be) is named "Відео на YouTube", while other YouTube links are named "YouTube"

#### Scenario: Close buttons for search and menu
- **WHEN** an unnamed button's class names mention both closing and search (for example `close-search`)
- **THEN** it is named "Закрити пошук", not "Пошук"
- **AND** closing plus menu gives "Закрити меню"

#### Scenario: Logo link to the home page
- **WHEN** an unnamed link points to the site's own root path
- **THEN** it is named "Головна сторінка"

### Requirement: Existing names are kept
Controls that already have a name containing letters or digits SHALL NOT be renamed, including names that come from a child element's `aria-label`.

#### Scenario: Name from a labelled child
- **WHEN** a button contains `<span aria-label="Previous">‹</span>`
- **THEN** the button keeps the name "Previous"

#### Scenario: Hidden control
- **WHEN** an unnamed control is hidden (`display:none`, `visibility:hidden`, `hidden`, or inside `aria-hidden="true"`)
- **THEN** it is left untouched

### Requirement: Unknown controls are flagged, not guessed
When no source gives a name, the control SHALL be marked `data-dostupno-needs-ai="name"` and left otherwise unchanged.

#### Scenario: No clue to the purpose
- **WHEN** an icon-only button has no title, known symbol, recognizable class names or target
- **THEN** it gets no `aria-label` and is marked `data-dostupno-needs-ai="name"`
