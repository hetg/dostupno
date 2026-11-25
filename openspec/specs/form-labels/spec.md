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
