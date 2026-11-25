# extension-ui Specification

## Purpose
The popup and first-run welcome page where users choose what helps them and control Доступно on the current site. The UI is Ukrainian and fully accessible itself.

## Requirements

### Requirement: Welcome page on first install
On first install the extension SHALL open a welcome tab titled "Вітаємо в Доступно" that explains the extension and lets the user choose profiles, with keyboard focus starting on the first choice.

#### Scenario: First install
- **WHEN** the extension is installed for the first time
- **THEN** a tab opens with the heading "Вітаємо в Доступно" and the question "Що вам допомагає?"
- **AND** focus is on "Я користуюсь скрінрідером"

#### Scenario: Choice saved
- **WHEN** the user changes a choice on the welcome page
- **THEN** it is saved immediately and "Готово. Доступно вже працює на всіх сайтах. Цю вкладку можна закрити." appears

### Requirement: Popup controls the current site
The popup SHALL show a switch for the current site, the Alt+Shift+D hint, a status of what was fixed, and the profile choices "Я користуюсь скрінрідером" and "Я погано бачу".

#### Scenario: Site switch
- **WHEN** the user opens the popup on example.ua
- **THEN** a switch named "Доступно на сайті example.ua" reports checked or unchecked to screen readers
- **AND** shows "Увімкнено на цьому сайті" or "Вимкнено на цьому сайті"

#### Scenario: Fix count
- **WHEN** Доступно changed 3 elements on the page
- **THEN** the status reads "Виправлено 3 елементи на цій сторінці."
- **AND** with no changes it reads "На цій сторінці нічого не довелося виправляти."

#### Scenario: Page opened before install
- **WHEN** the content script isn't running on the current page
- **THEN** the status reads "Оновіть сторінку, щоб Доступно почав працювати."

#### Scenario: Browser page
- **WHEN** the popup is opened on a non-web page (such as browser settings)
- **THEN** the site section is hidden and only profile choices are shown

### Requirement: The extension UI is accessible
The popup and welcome page SHALL be fully usable by keyboard and screen reader, readable in high-contrast mode and at 200% zoom, with `lang="uk"`.

#### Scenario: Keyboard only
- **WHEN** the user navigates the popup with Tab, Space and Enter only
- **THEN** every control can be reached and operated, and focus is always visible
