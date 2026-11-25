# Proposal

## Why

The popup and welcome page offer "Я користуюсь скрінрідером" ("Підписи до кнопок, зображень і полів форм"), but the setting does nothing: the image, control-name and form-label fixers are registered for the `all` profile, so they run whether the box is ticked or not, and no fixer uses the `screenreader` profile. A setting that silently does nothing breaks the user's trust in every other setting, and users who don't want labels added have no way to turn them off.

## What Changes

- The image alt text, control-name and form-label fixers run only when the screen reader profile is on.
- The page-language fixer stays on for everyone: a correct `lang` helps any speech output (screen readers, read-aloud, translation) and never changes what the page looks like.
- Unticking "Я користуюсь скрінрідером" removes those fixes from open pages immediately (through the existing revert and re-run path), and ticking it brings them back.
- Elements are only flagged for AI (`data-dostupno-needs-ai`) when the screen reader profile is on.
- Defaults are unchanged (screen reader on, low vision off), so a fresh install behaves exactly as today.
- **BREAKING** (behavior): users who had unticked the box, and so far still got labels, will stop getting them. This is what they asked for; no data migration is needed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `activation`: the "Runs on every site by default" and "Profiles select which fixers run" requirements now say which fixers each profile turns on, and that the screen reader profile really controls the label fixers.

## Non-goals

- Renaming or redesigning the profile choices in the popup or welcome page.
- Adding new profiles (for example voice control or cognitive) or per-fixer switches.
- Changing what any fixer writes into pages.
- Detecting whether a screen reader is actually running (browsers don't expose this, and guessing would be a privacy leak).

## Principles

- **Never make a page worse / don't override the site**: unchanged. Fixers write exactly what they wrote before; they just run under the profile the UI already promised. There is no new false-positive risk, because no fixer logic changes. The only new user-visible effect is fixes disappearing when a user turns the profile off.
- **Everything is reversible**: turning the profile off uses the existing revert-then-re-run path, which removes attributes and AI markers.
- **Silent**: no new announcements; changing a profile in the popup isn't announced on the page, as today.
- **Accessible own UI**: the popup and welcome markup don't change.
- **Privacy, performance, failure containment**: unaffected. With the profile off, fewer fixers run.

## Impact

- `extension/src/fixers/images.js`, `names.js`, `forms.js`: profile `all` → `screenreader`.
- Tests: `test/run-fixers.mjs` gets a run with the screen reader profile off; `test/e2e-extension.mjs` checks the real extension reverts labels when the profile is turned off in storage.
- Docs: `CLAUDE.md` fixer list notes each fixer's profile.
- No new permissions, dependencies, or storage format changes.
