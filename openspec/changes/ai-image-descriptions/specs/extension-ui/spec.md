# Spec Delta

## ADDED Requirements

### Requirement: AI descriptions opt-in
When a backend address is configured, the popup and the welcome page SHALL show a group "Описи зображень" with an unchecked-by-default checkbox "Описувати зображення за допомогою ШІ" and the description "Надсилає на сервер Доступно адресу зображення й короткий текст поруч. Ніколи — з банків, пошти, Дії, медичних та інших приватних сайтів." Ticking it saves `ai: true` immediately.

#### Scenario: First install with a backend configured
- **WHEN** the welcome page opens
- **THEN** it shows "Описувати зображення за допомогою ШІ" unchecked, after the profile choices

#### Scenario: Opting in from the popup
- **WHEN** the user ticks "Описувати зображення за допомогою ШІ" in the popup
- **THEN** `ai` is saved as `true` and the checkbox reports checked to screen readers

### Requirement: AI controls are hidden without a backend
When no backend address is configured (release builds until the backend is deployed), the popup and the welcome page SHALL show no AI controls and no mention of AI.

#### Scenario: Release build before deploy
- **WHEN** the user opens the popup of a release build with no backend address
- **THEN** there is no "Описи зображень" group, and the popup looks as it did before this change

### Requirement: Per-site sending control
When AI descriptions are on and the popup is opened on a web page, it SHALL show either a checkbox "Не надсилати нічого з цього сайту" reflecting whether the site's host is in `privateSites`, or, when the site is private by the built-in rules (built-in list, private path or non-public host), the note "З цього сайту нічого не надсилається: він приватний." instead of the checkbox.

#### Scenario: Excluding a news site
- **WHEN** AI descriptions are on and the user ticks "Не надсилати нічого з цього сайту" on `news.site.ua`
- **THEN** `news.site.ua` is added to `privateSites`, and unticking removes it

#### Scenario: Bank site
- **WHEN** AI descriptions are on and the popup is opened on `privatbank.ua`
- **THEN** it shows "З цього сайту нічого не надсилається: він приватний." and no checkbox

#### Scenario: AI off
- **WHEN** AI descriptions are off
- **THEN** no per-site sending control is shown

### Requirement: Firefox data-collection consent
In Firefox, ticking "Описувати зображення за допомогою ШІ" SHALL first ask for the browser's data-collection permission for website content and browsing activity. If the user declines, the checkbox stays unticked and `ai` stays `false`. If the permission is later revoked in the browser, nothing is sent.

#### Scenario: Consent declined
- **WHEN** a Firefox user ticks the checkbox and declines the browser's consent prompt
- **THEN** the checkbox is unticked and `ai` remains `false`

#### Scenario: Consent revoked later
- **WHEN** `ai` is `true` but the data-collection permission was removed in Firefox's add-on settings
- **THEN** no description is requested
