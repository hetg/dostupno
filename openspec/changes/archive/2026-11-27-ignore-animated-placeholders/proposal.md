# Proposal

## Why

Some sites animate the placeholder of their search field. They type example queries letter by letter, erase them and type the next one. comfy.ua does this on its header search (`<input name="q" placeholder="…">`). The `forms` fixer labels an unlabeled field from its placeholder once, at whatever moment it runs. In the real-site audit the same comfy field was labeled "блендер" on one run and "Пошук товарів" on another, and a run that lands mid-typing gives a broken label like "блен". A screen reader user then hears "блен, edit text" on every visit. That is a wrong label, which the principles rank as worse than none.

## What Changes

- The `forms` fixer keeps watching the placeholder of each field it labeled from the placeholder. If the site changes that placeholder to a different, non-empty text, the fixer stops trusting it for that field. Clearing it on focus and restoring it on blur, a common older pattern, doesn't count.
- If the site has named the field itself since then (a `<label>` or `aria-labelledby` added after hydration), Доступно only removes its own label.
- The field is then labeled again from the remaining sources, in the usual order: `title`, short text before the field, then a hint in `name`/`id`/`type`. comfy's `name="q"` gives "Пошук".
- If no other source gives a name, Доступно removes the label it added and marks the field `data-dostupno-needs-ai="label"`, as for any field with no usable source.
- The `name`/`id`/`type` hints are matched against each attribute on its own, as the spec already says. Until now the anchored search hint never matched, because the type was always appended. The search hint applies only to text and search fields, and the never-working `^name$` first-name hint is dropped (`name="name"` is often a product or company name).
- A placeholder that never changes is used exactly as today.
- Fields that the site labeled itself are still never touched, whatever their placeholder does.
- New fixture cases (an animated search field with a `name` hint, and an animated field with no other source) and smoke-test checks. A real-site check on comfy.ua with the audit.

## Non-goals

- Labeling a field from a "settled" animated placeholder (for example waiting for the typing to finish). An animated placeholder shows example queries, not what the field is.
- Watching placeholders that changed before the fixer first ran. The fixer can't tell those apart from a static placeholder.
- Other attributes changing after labeling (`title`, nearby text). No case has been seen in the audit.
- The other fixers.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `form-labels`: a new requirement: a placeholder that changes is not used as the label. A field labeled from it falls back to the other sources or to the AI marker. "Unlabeled fields get a label" gains scenarios for when a name hint applies (`name="q"` on a text field) and when it doesn't (a number field, `name="name"`).

## Principles

- **1. Never make a page worse.** This is the reason for the change: it removes a wrong label. The fallback chooses between the existing sources only, so it adds no new kind of guess. Between the first change of the placeholder and the relabel there is no wait (the fixer reacts in the same mutation callback), so the wrong label lives at most one animation step, typically under 200 ms.
- **2. Never override what the site did right.** Unchanged: fields with a name of their own are skipped before the placeholder is read. A relabel only replaces a label that Доступно added and that is still in place.
- **3. Reversible.** The relabel goes through `Dostupno.changes`. Removing a label needs a new `Dostupno.changes.removeAttr`, logged like `setAttr`, so `revertAll()` restores the page exactly.
- **7. Performance.** Only fields labeled from a placeholder are observed, with an attribute filter for `placeholder`. Typically that is one or two fields per page. An animated field stops being handled after its first change.
- **8. A failing fixer never breaks the page.** The observer callback is wrapped in try/catch, and `stop()` disconnects it on toggle off, before `revertAll()`.
- Principles 4–6 are unaffected: nothing is announced, there is no own UI, and nothing is sent anywhere.

## False-positive risks

- **A site changes a real placeholder once**, for example "Пошук" → "Пошук у категорії Ноутбуки" after a category is picked, or a translation applied after hydration. The field then gets a hint label ("Пошук") or the AI marker instead of the new text. That is less specific, but it isn't wrong, and the principles prefer cautious.
- **A field with no other source loses its label.** It goes back to "edit text" plus the AI marker. That's better than a label that is a fragment of an example query.
- **Matching the search hint per attribute** labels text fields named `q`/`s`/`search`/`query`/`keyword` "Пошук" when nothing better exists. A text field named `s` that isn't search (for example a size) would be mislabeled. Number fields are excluded. The all-sites audit compare shows no new hint labels.
- **The fallback hint is wrong for the field.** This is the same risk as today's hint path (for example a `name="q"` field that isn't a search). It is no wider than for fields without a placeholder.

## Impact

- `extension/src/fixers/forms.js`: remember which fields were labeled from the placeholder; one `MutationObserver` with `attributeFilter: ['placeholder']`; relabel or unlabel; `stop()`.
- `extension/src/core.js`: new `Dostupno.changes.removeAttr(el, name)`, recorded for `revertAll()`. Documented in `CLAUDE.md`.
- `test/fixtures/broken.html`: two fields with a scripted placeholder animation.
- `test/run-fixers.mjs`: checks for both fields, and that revert leaves both clean.
- `eslint-rules/no-direct-dom-mutation.js`: nothing to change. `removeAttr` goes through `Dostupno.changes`.
- `openspec/specs/form-labels/spec.md`: new requirement (through the delta).
