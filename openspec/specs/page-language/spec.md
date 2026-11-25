# page-language Specification

## Purpose
Makes screen readers use the right voice by filling in a missing page language, so Ukrainian text is not read with an English or Russian voice.

## Requirements

### Requirement: Missing page language is detected
When `<html>` has no `lang` (or an empty one), the extension SHALL detect the language from the page text using letters unique to each alphabet and set `lang` to `uk`, `ru` or `en`.

#### Scenario: Ukrainian page without lang
- **WHEN** a page has no `lang` and its text contains Ukrainian-only letters (і, ї, є, ґ) at least as often as Russian-only letters
- **THEN** `<html lang="uk">` is set

#### Scenario: Russian page without lang
- **WHEN** a page has no `lang` and its Cyrillic text has more Russian-only letters (ы, э, ъ, ё) than Ukrainian-only ones
- **THEN** `<html lang="ru">` is set

#### Scenario: Latin page without lang
- **WHEN** a page has no `lang`, more Latin than Cyrillic letters, and more than 50 Latin letters
- **THEN** `<html lang="en">` is set

#### Scenario: Language cannot be told
- **WHEN** the text is Cyrillic with no letters unique to Ukrainian or Russian, or there is too little text
- **THEN** `lang` is left unset

#### Scenario: Site already set a language
- **WHEN** `<html>` already has a non-empty `lang`
- **THEN** it is left untouched, even if the detected language differs
