# Design

## Context

Nothing is sent anywhere today (`manifest.json` declares `data_collection_permissions: none`).
Change 2 will add an AI client. Its network requests will most likely be made by the background
(service worker in Chrome, event page in Firefox), because content scripts can't reach the
backend reliably across sites. The gate therefore has to work in two places that share no
code today: content scripts (classic scripts on `window.Dostupno`) and the background
(`background.js`, its own global scope). Settings `DEFAULTS` are currently copied into
`content.js`, `background.js` and `popup.js`.

## Goals / Non-Goals

**Goals:**
- One implementation of the privacy rules, loaded in both page and background, with no build step.
- The gate always fails closed: any exception, unparsable URL or missing setting means "don't send".
- Both the rules and the shape of the call make it hard for change 2 to skip the gate.

**Non-Goals:**
- Enforcement in the backend (change 2), UI (change 2), blocking the page's own traffic.

## Decisions

### 1. One classic script, `extension/src/privacy.js`, attached to `globalThis.Dostupno.privacy`
It's a plain IIFE that does `const D = (globalThis.Dostupno = globalThis.Dostupno || {})`, so
it works on `window` in content scripts and on the worker global in the background.
- Content: listed in `content_scripts[0].js` right after `core.js`, before the fixers.
- Firefox background: added to `background.scripts` before `background.js`.
- Chrome service worker: `background.js` starts with
  `if (typeof importScripts === 'function' && !globalThis.Dostupno?.privacy) importScripts('privacy.js');`
  (path is relative to the worker script; `importScripts` doesn't exist in Firefox's event page,
  where the manifest already loaded the file).

*Alternatives:* an ES module background (`"type": "module"`) would mean different loading in
Chrome and Firefox and would split the content-script copy anyway. A copy of the list in each
file would drift apart.

### 2. Pure functions; settings passed in, never read inside
- `mayShareFrom(pageUrl, settings)`: http(s) AND public host AND not built-in private AND not a
  private path AND `settings.ai === true` (strictly true) AND `settings.enabled !== false` AND the
  host is in neither `settings.disabledSites` nor `settings.privateSites`. The background check is
  the authoritative one, so it must also refuse sites where Доступно is off.
- `mayShareUrl(itemUrl, settings?)`: http(s), no username or password, public host, not built-in
  private, not a private path, no fragment, no secret parameters; with `settings`, the item's own
  host must also pass the same settings rules (change 2 always passes them).
- `pageLooksPrivate(doc)`: walks the document, same-origin frames and shadow roots (Decision 5).
- `isPrivateHost(host)` / `isPublicHost(host)`: exposed for tests and for change 2's UI
  ("this site is private").

Pure functions are trivial to test in node and work the same in both contexts. Every
function body is wrapped in `try { … } catch { return false /* or true for *Private */ }`.

### 3. Host matching: exact or dot-suffix on the parsed, lowercased hostname
Hostnames come from `new URL(...).hostname` (already lowercase and punycoded), with a trailing
dot stripped. `host === d || host.endsWith('.' + d)`. This matches `next.privatbank.ua`, but not
`notprivatbank.ua` or `privatbank.ua.example.com`. User entries in `privateSites` are matched
the same way.

*Alternative:* the Public Suffix List for registrable domains. It's heavy (~200 KB) and isn't needed
for a curated list where we choose the exact domain level, for example `mail.google.com`, not `google.com`.

### 4. Non-public hosts
Not public: empty host, `localhost` or `*.localhost`, IPv4 literals (the URL parser normalizes
shorthand such as `0x7f.1`), IPv6 literals (`[...]`), single-label names (no dot), and suffixes
`.local`, `.internal`, `.lan`, `.corp`, `.home`, `.home.arpa`, `.intranet`, `.localdomain`, `.test`,
`.example`, `.invalid`, `.alt`, `.onion`, `.i2p` (Tor Browser can run Firefox extensions), and public
names that resolve to a local address (`nip.io`, `sslip.io`, `localtest.me`, bare or as a suffix). Any number of
trailing dots is stripped. We don't try to tell public IPs from private ones: no IP literal is shared.

### 4a. User entries and helper inputs are parsed like URLs
`privateSites`/`disabledSites` entries and `isPrivateHost`/`isPublicHost` inputs go through `hostOf`:
trim, parse as a URL (adding `http://` when there is no scheme), take the lowercase,
punycoded hostname, strip leading `.` and `*.` (also after a scheme), and reject anything still
containing `*` or an empty label. So `https://example.ua/`, `EXAMPLE.UA`, `example.ua:8443` and `приклад.укр`
all work. A `privateSites` that isn't an array, or holds a non-string or unparsable entry, makes
`mayShareFrom` return false (fail closed), so a bug in change 2's UI can't silently share.

### 4b. Private paths on public sites
`PRIVATE_PATHS` lists `[domain, path prefixes]` for direct messages on Facebook, Instagram, X/Twitter
and LinkedIn. The path is percent-decoded (undecodable counts as private), lowercased, doubled
slashes collapsed; a prefix matches when followed by the end or a non-word character, so
`/messages;x`, `/messages.php` and `/messages%2Ft` match but `/messagesforyou` doesn't. Item URLs
are checked against the same paths. In single-page apps the check uses the URL at the moment of sending, both in the page
(`location.href`) and in the background (`sender.url`).

### 4c. Only the page host leaves the device
`pageHost(url)` returns the hostname. Change 2 sends that, never the page URL, which can carry reset
tokens, invite codes or search terms.

### 5. Secret-field page check
`pageLooksPrivate` checks for
`[type=password], [autocomplete~="one-time-code"], [autocomplete*="cc-"], [autocomplete~="current-password"], [autocomplete~="new-password"]`
(`[type=password]` on any element, so custom elements like `<sl-input type="password">` count) plus
`iframe[src]` whose host is built-in private or a payment-frame host (`PAYMENT_FRAME_DOMAINS`: Stripe,
Braintree, Adyen, Google Pay, Checkout.com; listed for iframes only, so their public sites aren't
blocked). It walks into Shadow DOM, including closed roots where the content-script API allows
(`openOrClosedShadowRoot` in Firefox, `chrome.dom.openOrClosedShadowRoot` in Chrome). Hidden fields
count too, and so do card fields without `autocomplete` (`name`/`id` containing `cardnumber`,
`card_number`, `card-number`, `cvv`, `cvc`). Same-origin iframes (`contentDocument` readable) are
checked like the page. Nesting deeper than 20 roots counts as private. Being strict costs only a
skipped AI request.

Performance: the walk visits every element once (`querySelectorAll('*')` per root) but calls the
shadow-root API only on elements that can host one (custom elements and the built-in tags
`attachShadow` allows), a few milliseconds on big pages. It runs only right before sending (once per batch in change 2), never
during fixing, so fixer time is unchanged.

### 6. Secret URL parameters
The query is split on `&` and `;`. Each name is percent-decoded, lowercased, and stripped of `-`,
`_` and a trailing `[]`. A name blocks sending if it contains `token`, `secret`, `passw`,
`signature`, `credential`, `session`, `hmac`, `jwt`, `auth`, `email` or `phone`, or equals `key`,
`apikey`, `sig`, `sid`, `code`, `policy`, `keypairid`, `oh`, `oe` (Facebook CDN), `otp`, `pwd`, `pin`
or `ticket`. An undecodable name blocks too. Item URLs with any
fragment (fetching never needs it; MEGA-style `#key` links carry keys there), or
`;jsessionid=`/`;sid=`/`;token=` in the path, are refused.
This covers S3, GCS, CloudFront, Azure SAS and Facebook CDN signed URLs and common token links.
Over-blocking (`?author=`, `?code=` product codes) costs only a skipped AI request. CDN resizing
params (`w`, `q`, `fit`) are unaffected.

### 7. Built-in list as one frozen array grouped by category
Each category is a commented block in `privacy.js`, so reviewers can see why a domain is there.
Initial content (every domain is checked by hand before it lands, see tasks):
- Banks and payments: privatbank.ua, privat24.ua, monobank.ua, oschadbank.ua, pumb.ua,
  raiffeisen.ua, ukrsibbank.com, sensebank.com.ua, abank.com.ua, ukrgasbank.com, otpbank.com.ua,
  izibank.com.ua, creditagricole.ua, procreditbank.com.ua, liqpay.ua, portmone.com.ua,
  easypay.ua, ipay.ua, wayforpay.com, fondy.ua, novapay.ua, paypal.com, wise.com, revolut.com
- Government personal cabinets: diia.gov.ua, id.gov.ua, cabinet.tax.gov.ua, portal.pfu.gov.ua,
  id.court.gov.ua
- Mail: mail.google.com, outlook.live.com, outlook.office.com, outlook.office365.com,
  mail.ukr.net, mail.i.ua, mail.meta.ua, mail.yahoo.com, mail.proton.me, app.tuta.com
- Messengers, work chat, calendars and contacts: web.telegram.org, web.whatsapp.com,
  messenger.com, app.slack.com, discord.com, teams.microsoft.com, ton.twitter.com (X DM media),
  chat.google.com, meet.google.com, calendar.google.com, contacts.google.com, keep.google.com,
  calendar.proton.me
- AI assistant chats: chatgpt.com, claude.ai, gemini.google.com
- Medical: helsi.me, doc.ua, ehealth.gov.ua, dila.ua, synevo.ua
- Accounts, documents, photos and storage: myaccount.google.com, photos.google.com,
  docs.google.com, drive.google.com, onedrive.live.com, sharepoint.com, dropbox.com, icloud.com,
  notion.so (private photos matter most: their image URLs carry no token, so only the page rule
  stops them)
- Password managers: vault.bitwarden.com, my.1password.com, lastpass.com, pass.proton.me
  (plus drive.proton.me, account.proton.me under storage)
- Home router admin pages: tplinkwifi.net, routerlogin.net, my.keenetic.net

Government sites are listed by personal-cabinet host, not all of `gov.ua`: public information
pages (hromada and ministry news) are exactly where alt text helps most.

### 8. Settings defaults
Add `ai: false, privateSites: []` to the three `DEFAULTS` objects. `chrome.storage.sync.get(DEFAULTS)`
fills missing keys, so existing installs need no migration. `content.js`'s `onChanged` handler
already ignores keys other than `profiles` unless the run state changes, so toggling `ai` or
`privateSites` reverts or re-applies nothing. No DOM changes in this change, so nothing new needs reverting.

### 9. Tests
- `test/privacy.test.mjs` (node `node:test`): loads `privacy.js` with `vm.createContext` + `vm.runInContext` and
  checks the URL and host rules against the spec scenarios. It then checks `pageLooksPrivate` in
  Chromium (Playwright `setContent`): login form, `cc-number`, LiqPay/Stripe/Braintree iframes,
  a custom-element password field, a password field in nested open Shadow DOM, and a plain
  article and harmless Shadow DOM, which must stay not private. Closed shadow roots need the
  content-script API and are not covered by this page-context test. CI runs it as its own step.
  It also runs both background loading paths in node: Firefox's event page (`background.scripts`
  in order, no `importScripts`) and Chrome's worker (`background.js` importing `privacy.js`).
  Real Firefox is checked by hand with the Weekend 4 Firefox work.
- `npm test` (run-fixers) gains a check that `Dostupno.privacy` exists after the content
  scripts load. Fixers already run on the fixture, a `file:` page the gate treats as non-public, which covers
  "private pages keep local fixes".
- `npm run test:e2e`: the service worker has `Dostupno.privacy.mayShareFrom`, which proves
  `importScripts` works in the real extension.

## Risks / Trade-offs

- [A private site missing from the list] → AI is opt-in, the secret-field and signed-URL checks
  catch the most sensitive moments, and the user can exclude any site. The list grows by review.
- [`importScripts` path or load-order mistake breaks the background] → the e2e test asserts the
  gate exists in the worker. A guard avoids double loading in Firefox.
- [Over-blocking: `discord.com` or `notion.so` public pages get no AI] → acceptable; strictness
  is the point of principle 6.
- [Domain list typos] → a task checks every domain resolves before merging. The unit tests
  include look-alike domains.
- [Direct messages on sites not in `PRIVATE_PATHS`, other private paths] → the list covers the
  big four. Others are blocked only by the secret-field check or the user's `privateSites`. Extend
  by review.
- [Direct messages in overlays on public paths (X's Messages drawer on `/home`, LinkedIn chat on
  `/feed/`)] → only partly covered: X DM media (`ton.twitter.com`) and Facebook/Instagram CDN
  images (`oh`/`oe`) are refused, but LinkedIn's signed media (`media.licdn.com …&t=`) looks like
  public post media. Revisit with change 2's real traffic.
- [Over-blocking: Stripe.js puts a `js.stripe.com` controller iframe on every page that loads it]
  → whole shops get no AI. Accepted strictness; narrow to card-field frames if users miss it.
- [Closed shadow roots] → reachable only through the content-script API, so the Chromium page test
  covers open roots only. Change 2's e2e should include a closed-root case.
- [Change 2 forgets to call the gate] → CLAUDE.md and the data-sharing spec require it, and
  `a11y-reviewer` checks principle 6. Change 2's tasks will add a test that no request is made
  from a private host.

## Migration Plan

No migration: new settings come from defaults. Rollback means removing `privacy.js` from the
manifest and the `importScripts` line; nothing reads the new settings yet.

## Open Questions

- Should the backend import this same file for its server-side check (Workers can bundle it)?
  Decided in change 2. It doesn't affect this change's API.
