# Proposal

## Why

Weekend 2 adds an AI backend that writes Ukrainian alt text and control names. Before any page
data can leave the browser, Доступно needs one privacy gate that every future network path must
pass. It decides whether anything may be sent from a page (never from banking, Diia, mail or
medical sites, intranets, or sites the user excluded) and which item URLs are safe to send. Building and testing the gate first,
while nothing is sent yet, means the backend client (change 2) cannot ship without it and cannot
route around it.

## What Changes

- New shared script `extension/src/privacy.js`, loaded both as a content script and in the
  background. It holds:
  - a **built-in list of private sites**: Ukrainian banks and payment services, Diia and other
    government cabinets, webmail, web messengers, medical portals, cloud documents and password
    managers, accounts and photos. A hostname matches if it is the listed domain or one of its
    subdomains. Plus private paths on public sites (direct messages on Facebook, Instagram, X,
    LinkedIn).
  - **non-public hosts** that are never shared: `localhost`, IP addresses, single-label and
    intranet or special-use names (`.local`, `.corp`, `.test`, …), anonymity networks (`.onion`,
    `.i2p`), and every non-http(s) page.
  - `Dostupno.privacy.pageHost(pageUrl)`: the only thing about the page that may be sent (never
    the full URL, which can hold reset tokens or invite codes).
  - `Dostupno.privacy.mayShareFrom(pageUrl, settings)`: may anything be sent from this page?
    False when AI descriptions are off, Доступно is off on the site, the site is in the user's
    `privateSites`, or the host or path is built-in private or non-public.
  - `Dostupno.privacy.mayShareUrl(itemUrl, settings)`: may this image URL be sent? False for non-http(s)
    URLs, `data:` and `blob:` URLs, URLs with credentials, non-public hosts, and URLs that carry
    access tokens or signatures (signed links to private files).
  - `Dostupno.privacy.pageLooksPrivate(document)`: true on pages with a password, one-time-code
    or payment-card field (including inside Shadow DOM) or an embedded payment form (Stripe,
    Braintree, Adyen, Google Pay, LiqPay…). These pages are treated as private for this load, even
    on public sites (a shop's checkout, a news site's login).
- Two new synced settings with safe defaults: `ai: false` (AI descriptions are opt-in) and
  `privateSites: []` (sites the user excluded from sending). Both are ignored by the existing
  fixers and are not shown in the popup yet. The opt-in toggle and the per-site switch ship with
  the backend in change 2, so users never see controls for a feature that doesn't exist.
- A node test for the gate (`test/privacy.test.mjs`), added to `npm run check`.

## Capabilities

### New Capabilities
- `data-sharing`: what Доступно may send off the device, from which pages, and which item URLs.
  Owns the built-in private-site list, the non-public host rules, the user's `privateSites`, the
  `ai` opt-in, and the rule that every network request goes through the gate.

### Modified Capabilities
- `activation`: the stored settings gain `ai` (default `false`) and `privateSites` (default `[]`).
  Turning a site off (`disabledSites`) is unchanged and stays separate from excluding it from
  sending (`privateSites`).

## Principles touched

- **6. Privacy:** the main point. The gate defaults to "send nothing": AI is off unless the user
  opts in, and any doubt about a page or URL (unknown scheme, a URL that fails to parse, a
  private-looking page) means no.
- **1. Never make a page worse / 3. Reversible / 8. Failing fixer:** untouched. The gate makes no
  DOM changes and fixers don't call it. Local fixers keep running on private sites; only sending
  is blocked.
- **5. Accessible UI:** no UI in this change. The controls ship in change 2 and get the usual
  keyboard and screen reader checks there.
- **7. Performance:** hostname checks are a few string comparisons. `pageLooksPrivate` walks the
  document once (a few ms on big pages), only when something is about to be sent, never during
  fixing.

## Non-goals

- No network requests, backend, or AI client. Those are change 2, which must call this gate.
- No popup or welcome-page controls (change 2).
- No server-side check. The backend will refuse excluded domains too (see `backend/README.md`).
  Whether it imports `privacy.js` or keeps its own copy is decided in change 2.
- No change to which fixers run on private sites. `lang`, `images`, `names`, `forms`, `contrast`
  and `focus` keep working there exactly as now.
- No attempt to block the page's own network traffic.

## False-positive risks

This change writes nothing into pages, so fixers gain no false positives. The gate's own errors
fail in one of two directions:
- **Too strict** (a public page treated as private): the user just gets no AI descriptions there.
  Acceptable.
- **Too loose** (a private page not on the list): the real risk. It is limited by the AI opt-in
  being off by default, the `pageLooksPrivate` field check, the signed-URL check, and the
  user's `privateSites`. The list starts small and verified and grows by review.

## Impact

- New: `extension/src/privacy.js`, `test/privacy.test.mjs`.
- `extension/manifest.json`: `privacy.js` added to the content scripts (before `content.js`) and to
  `background.scripts` for Firefox. The Chrome service worker loads it with `importScripts`.
- `extension/src/content.js`, `background.js`, `popup/popup.js`: `DEFAULTS` gain `ai` and
  `privateSites` (no behavior change).
- `package.json`: `check` also runs the privacy test.
- `CLAUDE.md`: settings shape, the new shared script, and the rule that network code must use the gate.
