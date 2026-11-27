# form-labels Specification

## Purpose
Tells screen reader users what to type into form fields that have no label, instead of announcing just "edit text".

## Requirements

### Requirement: Unlabeled fields get a label
Visible `input` (except hidden, submit, button, image and reset), `select` and `textarea` fields with no accessible name SHALL get an `aria-label`. Sources, best first: the placeholder (unless it is an example value or mask); `title`; short text (60 characters or less) right before the field; a known hint in the `name`, `id` or `type`. A trailing ":" or "*" is removed.

#### Scenario: Placeholder as label
- **WHEN** a search field has no label and placeholder "Пошук по сайту"
- **THEN** it is labeled "Пошук по сайту"

#### Scenario: Text before the field
- **WHEN** a field is preceded by the text "Електронна пошта:"
- **THEN** it is labeled "Електронна пошта"

#### Scenario: Hint from the name or type
- **WHEN** an unlabeled field without placeholder has `name="phone"` or `type="tel"`
- **THEN** it is labeled "Телефон"
- **AND** e-mail hints give "Електронна пошта", search hints "Пошук", password "Пароль", first name "Ім'я", last name "Прізвище", city "Місто", address "Адреса", message "Повідомлення"

#### Scenario: Search hint from the name alone
- **WHEN** an unlabeled text field has only `name="q"` (or `s`, `search`, `query`, `keyword`) and an unrelated `id`
- **THEN** it is labeled "Пошук"

#### Scenario: Hints that don't fit the field
- **WHEN** an unlabeled `type="number"` field has `name="q"`, or an unlabeled text field has `name="name"`
- **THEN** it gets no label from the hint: a number field is not a search box, and "name" is often a product or company name, not "Ім'я"
- **AND** with no other source it is marked `data-dostupno-needs-ai="label"`

### Requirement: Example placeholders are not labels
Placeholders that show an example value or input mask (containing "@", a URL or domain, digits and mask characters like `+38 (0__) ___-__-__`, a date mask like `дд.мм.рррр`, or starting with "наприклад"/"e.g.") SHALL NOT be used as the label.

#### Scenario: Example e-mail placeholder
- **WHEN** an unlabeled `type="email"` field has placeholder "name@mail.com"
- **THEN** it is labeled "Електронна пошта", not "name@mail.com"

#### Scenario: Phone mask placeholder
- **WHEN** an unlabeled `type="tel"` field has placeholder "+38 (0__) ___-__-__"
- **THEN** it is labeled "Телефон"

### Requirement: Labeled and unknown fields
Fields that already have a name SHALL be left untouched; fields with no usable source SHALL be marked `data-dostupno-needs-ai="label"`.

#### Scenario: Field has a label
- **WHEN** a field has a `<label>`, `aria-label` or `aria-labelledby` with text
- **THEN** it is left untouched

#### Scenario: Empty aria-label
- **WHEN** a field has `aria-label=""` and placeholder "Пошук"
- **THEN** it is labeled "Пошук"

#### Scenario: No source
- **WHEN** an unlabeled field has no placeholder, title, nearby text or recognizable name
- **THEN** it is marked `data-dostupno-needs-ai="label"`

### Requirement: Changing placeholders are not labels
When the site changes the placeholder of a field Доступно labeled from it to a different, non-empty text, Доступно SHALL stop using that placeholder and remove the label it added. If the site has named the field since, nothing more is done. Otherwise the field is labeled from the other sources (`title`, text before the field, a `name`/`id`/`type` hint) or, if none gives a name, marked `data-dostupno-needs-ai="label"`. Clearing or restoring the placeholder doesn't count.

#### Scenario: Animated search placeholder with a name hint
- **WHEN** an unlabeled field with `name="q"` has a placeholder that the site types out letter by letter ("б", "бл", "блен", "блендер", then the next example)
- **THEN** within one change of the placeholder the field is labeled "Пошук"
- **AND** its label never becomes "блендер" or any other example text after that

#### Scenario: Animated placeholder with no other source
- **WHEN** an unlabeled field with no `title`, no text before it and no recognizable `name`, `id` or `type` has an animated placeholder
- **THEN** the field has no `aria-label` from Доступно
- **AND** it is marked `data-dostupno-needs-ai="label"`

#### Scenario: Placeholder cleared on focus
- **WHEN** an unlabeled field with placeholder "Пошук по сайту" clears its placeholder when focused and puts it back on blur
- **THEN** it keeps the label "Пошук по сайту" while focused and after blur

#### Scenario: Site adds its own label later
- **WHEN** a field was labeled from its placeholder, then the site adds a `<label>` for it and changes the placeholder
- **THEN** Доступно's `aria-label` is removed, so the site's label is announced
- **AND** the field gets no `data-dostupno-needs-ai`

#### Scenario: Placeholder that never changes
- **WHEN** an unlabeled search field has placeholder "Пошук по сайту" and the site never changes it
- **THEN** it is labeled "Пошук по сайту", as before

#### Scenario: Site-labeled field with an animated placeholder
- **WHEN** a field already has a label of its own (a `<label>`, `aria-label` or `aria-labelledby` with text) and an animated placeholder
- **THEN** it is left untouched: no `aria-label` from Доступно and no `data-dostupno-needs-ai`

#### Scenario: Turning Доступно off
- **WHEN** a field was relabeled or unlabeled because its placeholder changed, and the user turns Доступно off for the site
- **THEN** the field has exactly the attributes the site gave it: no `aria-label` from Доступно, no `data-dostupno` and no `data-dostupno-needs-ai`
- **AND** the placeholder keeps animating as the site intended
