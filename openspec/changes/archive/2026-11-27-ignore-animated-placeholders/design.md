# Design

## Context

`forms.js` runs once per field (`D.once(el, 'forms')`) when the field first appears. It reads the placeholder at that moment and calls `D.changes.setAttr(el, 'aria-label', …)`. Nothing looks at the field again. `content.js` watches only `childList` (new subtrees), not attribute changes. `D.changes` can set attributes and styles but can't remove an attribute.

The live behavior of comfy.ua could not be recorded for this proposal: loading it from an ad-hoc script was blocked. The evidence is the audit reports: on separate runs, the same `<input name="q" class="head-sf__input">` was labeled "блендер" and "Пошук товарів", plus the earlier "блен" finding. That fits a typing animation through `setAttribute('placeholder', …)` or the `placeholder` property (both show up as attribute mutations). Task 1.1 confirms it on the real page before any code is written.

## Goals / Non-Goals

**Goals:**
- React to the first placeholder change on a field that Доступно labeled from it, in the same mutation callback, with no timers.
- Watch only those fields.
- Keep the change log exact through any number of relabels.

**Non-Goals:**
- A general "re-run fixers when attributes change" mechanism in `content.js`.
- Detecting animation before the first change (for example with a time window).

## Decisions

### Watch from the fixer, not from content.js
`forms.js` gets its own `MutationObserver`, created when it labels the first field from a placeholder. It calls `observer.observe(field, { attributes: true, attributeFilter: ['placeholder'] })` per field. Calling `observe()` on several targets with one observer is allowed and cheap. `stop()` disconnects it and forgets the fields. This is the pattern `contrast.js` already uses with `IntersectionObserver`.

*Alternative:* add `attributes`/`attributeFilter` to the `content.js` observer and re-run fixers on attribute changes. Rejected: every fixer would need to handle re-runs, and `D.once` exists to prevent exactly that. It would also turn one field's animation into fixer re-runs on every animation step.

### First change ends trust; no "settled" detection
On the first mutation, the field goes into a `WeakSet` of untrusted fields and is relabeled. Later mutations of that field are ignored. There is no `unobserve` per target, so the callback checks the set and returns early, which costs a few microseconds per animation step.

*Alternative:* wait until the placeholder stops changing and use the final text. Rejected: animated placeholders cycle forever on comfy, and when they do stop, the text is an example query, not what the field is.

### Which placeholder changes count
Only a change to a different, non-empty text ends trust. An empty value is skipped (many sites clear the placeholder on focus and restore it on blur), and so is the original value set again. The typing animation still triggers on its next letter.

### Relabel only our own, still-present label
Before relabeling, the callback checks that the field's `aria-label` still equals the value Доступно set. A `WeakMap` field → label stores that value. If the site has since set its own `aria-label` (or removed ours), the field is left alone and is no longer watched. Otherwise our label is removed first. If the field then has a name of its own (a `<label>` or `aria-labelledby` the site added after the first run), nothing more is done. This keeps principle 2: we never replace or shadow a label we didn't add.

### Shared source chain without the placeholder
The current inline chain (placeholder → title → nearby text → name hints) becomes `labelFor(el, { usePlaceholder })`, used by both the first run and the relabel. That keeps one ordering and one cleanup (`/[:*]\s*$/`).

### `D.changes.removeAttr(el, name)`
It records `{ el, kind: 'attr', name, oldValue: el.getAttribute(name) }` and then removes the attribute. If the attribute is already absent, it does nothing (like `setAttr`'s equal-value early return). Revert walks newest-first, so a field labeled "блен" from nothing and then unlabeled gets "блен" back and then is cleared to nothing. Relabeling through `setAttr` works the same way: the log holds "блен" → "Пошук", and revert restores "блен" and then null.

The `data-dostupno-needs-ai="label"` marker is set the same way `forms.js` sets it today (a direct `setAttribute`, which the lint rule allows for that attribute). `revertAll()` already removes every marker.

### Fixture animation
The fixture drives its own placeholder with `setInterval` (~80 ms per letter), like a typical typewriter widget. The smoke test waits for a couple of animation steps and then reads the field. That needs no fake timers, and the test doesn't depend on when the fixer happened to run.

## Risks / Trade-offs

- [A placeholder changes before the fixer first runs] → The fixer sees one value and labels from it. If the animation keeps going, the next step triggers the relabel, so only a single, one-time change is missed. That case is like a static placeholder and harmless.
- [The wrong label is announced during the first animation step] → The relabel happens in the mutation callback, before the next paint. A screen reader that has already read the field in that window hears the fragment once. That's acceptable compared with today, where it hears it forever.
- [A site sets a placeholder once after hydration, for example a translation] → The field falls back to a hint or the AI marker. That's cautious but not wrong. The audit compare (task 3.2) shows whether any audited site does this.
- [Performance on large pages] → Only fields labeled from a placeholder are observed, and they are filtered to one attribute. No re-scans: the relabel touches only the mutated field. There are no timers.
- [Revert on toggle off] → `stop()` runs before `revertAll()` and disconnects the observer, so a placeholder change during or after revert can't relabel anything. All label changes are in the log, so they are undone newest-first. The marker is removed by `revertAll()`. Toggling on again runs the fixer from scratch: `processed` is reset, and the untrusted set lives inside the fixer and is cleared in `stop()`. The animated field is then labeled from its current placeholder and relabeled on the next step, as on a fresh load.

## Migration Plan

None. Content-script change only. Roll back by reverting the commit.
