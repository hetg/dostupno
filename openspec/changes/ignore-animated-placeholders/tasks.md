# Tasks

## 1. Confirm the cause

- [x] 1.1 Confirm on the real page that comfy.ua animates the header search placeholder. Run `npm run audit -- https://comfy.ua/` twice and compare the `forms` change for `input.head-sf__input` in `test/audit-report/comfy.ua.json` (expected: different labels across runs). If the audit is blocked for the agent, ask the user to run it, or to watch the field in DevTools (Elements panel, placeholder attribute flashing). Record what you saw in this task's line. If the placeholder turns out to be static and only differs per load (A/B text, not animation), stop and update the proposal before coding.
  Result (2026-11-26): three audit runs labeled `input.head-sf__input` "па", "Пошук товарів", "Пошук товарів". A two-letter fragment is mid-typing, so the placeholder is animated.

## 2. Reversible attribute removal

- [x] 2.1 Add `D.changes.removeAttr(el, name)` to `extension/src/core.js`. It logs `{ el, kind: 'attr', name, oldValue }` and removes the attribute; it does nothing when the attribute is absent. Verify with a smoke-test check in `test/run-fixers.mjs` (in page): set → set → remove on a scratch element, then `revertAll()` restores the original value, and with no original the attribute is absent. Then `npm test`.
- [x] 2.2 Document `removeAttr` in `CLAUDE.md` (principle 3 list and the fixer contract comment). Verify the names match the code.

## 3. Forms fixer stops trusting changing placeholders

- [x] 3.1 In `extension/src/fixers/forms.js`, move the source chain into `labelFor(el, { usePlaceholder })`, so the first run and the relabel share the order and the `:`/`*` cleanup. Verify that `npm test` passes unchanged (no behavior change yet).
- [x] 3.2 Add the placeholder watcher described in design.md:
  - one `MutationObserver` with `attributeFilter: ['placeholder']`, observing only fields labeled from their placeholder;
  - a `WeakMap` of the label Доступно set;
  - a `WeakSet` of untrusted fields.
  On the first change, if the field's `aria-label` is still ours, relabel it with `labelFor(el, { usePlaceholder: false })`. If that gives nothing, call `removeAttr` and set the `data-dostupno-needs-ai="label"` marker. The callback is wrapped in try/catch. `stop()` disconnects the observer and clears the maps. Verify with `npm run lint` and task 3.3.
- [x] 3.2a (found while applying) Match the `name`/`id`/`type` hints against each attribute on its own, as the form-labels spec says. Today they are joined into one string with the type always appended (`"q  text"`), so the anchored search hint (`^(q|s|search|query|keyword)s?$`) and `^name$` never match. comfy's `name="q"` would get the AI marker instead of "Пошук". Verify with a fixture check (a field with only `name="q"` and an `id` gets "Пошук"), and in task 4.2 review every new hint label in `compare.md`.
- [x] 3.3 Fixture and checks:
  - In `test/fixtures/broken.html`, add a form with two fields whose placeholders a small inline script types out letter by letter (about 80 ms per letter, cycling "блендер", "телевізор", "ноутбук"): `#typed-search` with `name="q"`, and `#typed-unknown` with `name="f1"` and no other source.
  - Add a third field, `#typed-labelled`, with `aria-label="Пошук товарів"` and the same animation (must stay untouched).
  - Add all three to `NAMED` if the precondition and accname agreement checks need them, and make sure the precondition check accepts an animated placeholder.
  - In `test/run-fixers.mjs`, after waiting at least three animation steps, check:
    - `#typed-search` is labeled "Пошук", and stays "Пошук" after three more steps;
    - `#typed-unknown` has no `aria-label` and has `data-dostupno-needs-ai="label"`;
    - `#typed-labelled` is untouched (its own label, no `data-dostupno`, no marker);
    - the static `name="q"` field is still "Пошук по сайту".
  - Revert check: all three fields end with exactly their original attributes, and the animation still runs.
  Verify that each new check fails with the watcher disabled (comment out the `observe` call temporarily), then `npm test` passes.
- [x] 3.4 Update the `forms` line in `CLAUDE.md` to say that a placeholder the site changes is not used. Verify it matches the code.

## 4. Integration

- [x] 4.1 Run `npm run check` and verify that it passes.
- [x] 4.2 Run `npm run audit -- --compare main` (all sites). In `compare.md`, the comfy search field should change from an example word (or "Пошук товарів") to "Пошук", with no other `forms` changes new or gone except fields whose placeholder changes. Review each one against the false-positive risks in the proposal. Revert must leave nothing behind. If the agent can't run the audit, hand the command to the user (or the `audit-triage` subagent) and record the result in the PR.
  Result (2026-11-26), all 22 sites:
  - comfy.ua: the search field went from a fragment on `main` ("бленде", "п") or "Пошук товарів" to "Пошук" (labeled "бленде", then relabeled on the next change).
  - epicentrk, zp.gov.ua, allo: churn in `images`/`names` from lazy loading and timing. Those fixers are unchanged.
  - nv.ua: −3 `forms` labels on the login form. Not caused by this change: the same −3 shows with `main` on both sides (A/A, extension changes stashed), so it's a compare-mode artifact of that form on the second run. Audited alone, the working tree labels all three.
  - No revert leftovers on any site.
  - The recorder (`test/audit-sites.mjs`) now attributes deferred attribute changes to `forms` and records `removeAttr`.
- [x] 4.3 Run the `a11y-reviewer` subagent on the diff and address its findings or record why not.
  Findings (2026-11-26), all fixed, with checks that fail without the fix:
  1. A placeholder cleared on focus ended trust, so a correctly labeled field lost its name while focused. Fix: an empty or restored placeholder doesn't count.
  2. Per-attribute hints labeled `type="number" name="q"` as "Пошук" and `name="name"` as "Ім'я". Fix: the search hint only on text/search fields, and `^name$` dropped.
  3. The relabel could shadow a `<label>` the site added after the first run. Fix: remove our label, then stop if the field has a name.
  4. The audit recorder credits deferred attribute changes to `forms`: kept and commented, test tooling only.
  The delta spec, proposal and design are updated to match.
- [ ] 4.4 Manual check for the user: on comfy.ua with VoiceOver (Cmd+F5), Tab to the header search field. It's announced as "Пошук, edit text" (or similar) on several reloads, never as an example word. Turn Доступно off with Option+Shift+D and back on. The field is announced the same way, and the placeholder keeps animating. Record the result in the PR description.

## Workflow follow-up

- Archive the change after the PR is merged (`/openspec-archive-change`), which adds the requirement to `openspec/specs/form-labels/spec.md`.
