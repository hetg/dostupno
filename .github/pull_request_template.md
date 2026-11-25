## What and why
<!-- One or two sentences. Link the OpenSpec change if there is one: openspec/changes/<name>/ -->

## Principles (CLAUDE.md)
- [ ] Never makes a page worse: when unsure, the fixer does nothing
- [ ] Doesn't override what the site already did right
- [ ] All DOM changes go through `Dostupno.changes` and revert on toggle off
- [ ] Silent: no new announcements except on/off
- [ ] Extension UI stays accessible (keyboard, screen reader, high contrast, 200% zoom)
- [ ] Privacy: no page content leaves the browser
- [ ] Performance: new subtrees only, no full re-scans
- [ ] A failure in this code can't break the page

## Verification
- [ ] `npm run check` passes (lint, smoke test, e2e, specs)
- [ ] Fixer behavior changed → fixture cases added, including a must-stay-untouched case
- [ ] Fixer behavior changed → `npm run audit -- --compare main` reviewed; notable new/gone changes:
  <!-- paste a few lines from test/audit-report/compare.md, or "none" -->
- [ ] Screen reader check needed? **yes / no** (if yes, who checks with NVDA / VoiceOver and how)
