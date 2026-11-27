# Spec Delta

## Purpose

Decides what Доступно may send off the user's device (for AI descriptions) and from which pages, so that nothing ever leaves private pages, intranets or sites the user excluded, and only public item URLs are ever sent.

## ADDED Requirements

### Requirement: Nothing is sent unless the user opted in
Доступно SHALL NOT send any page content, URL or context to any server unless the user has turned on AI descriptions. AI descriptions SHALL be off by default.

#### Scenario: Fresh install
- **WHEN** the user installs Доступно and opens any public website
- **THEN** no request carrying page content or URLs is made to any server
- **AND** the stored setting `ai` is `false`

#### Scenario: Opted in on a public page
- **WHEN** `ai` is `true` and the user opens a public news site that is not private by any rule below
- **THEN** sending from that page is allowed

### Requirement: Built-in private sites never share
Доступно SHALL carry a built-in list of private site domains (banks and payment services, Diia and government personal cabinets, webmail, web messengers, calendars and contacts, AI assistant chats, medical portals, accounts, photos and cloud documents, password managers, home router admin pages). Nothing SHALL be sent from a page whose hostname is a listed domain or a subdomain of one, even when the user opted in.

#### Scenario: Bank subdomain
- **WHEN** `ai` is `true` and the page is `https://next.privatbank.ua/cards`
- **THEN** sending from that page is not allowed

#### Scenario: Diia
- **WHEN** `ai` is `true` and the page is on `diia.gov.ua` or any of its subdomains
- **THEN** sending from that page is not allowed

#### Scenario: Webmail
- **WHEN** `ai` is `true` and the page is `https://mail.google.com/mail/u/0/`
- **THEN** sending from that page is not allowed

#### Scenario: Look-alike domain is not matched by suffix text
- **WHEN** the page is on `notprivatbank.ua` or `privatbank.ua.example.com`
- **THEN** the built-in list does not treat it as `privatbank.ua`

### Requirement: Non-public pages never share
Nothing SHALL be sent from pages that are not on the public web: non-http(s) pages, `localhost`, IP-address hosts, single-label hostnames, intranet and special-use suffixes (`.local`, `.internal`, `.lan`, `.corp`, `.home`, `.home.arpa`, `.intranet`, `.localdomain`, `.test`, `.example`, `.invalid`, `.alt`), anonymity networks (`.onion`, `.i2p`), and public names that point at a local address (`nip.io`, `sslip.io`, `localtest.me`).

#### Scenario: Intranet host
- **WHEN** `ai` is `true` and the page is `http://wiki.corp/` or `http://192.168.1.10/`
- **THEN** sending from that page is not allowed

#### Scenario: Onion site in Tor Browser
- **WHEN** `ai` is `true` and the page is on a `.onion` host
- **THEN** sending from that page is not allowed

#### Scenario: Local file
- **WHEN** the page is a `file:` URL
- **THEN** sending from that page is not allowed

### Requirement: User-excluded sites never share
Nothing SHALL be sent from a site the user excluded (`privateSites`, synced). A host matches if it equals an entry or is a subdomain of it. Excluding a site from sending SHALL NOT turn Доступно off there; local fixes keep running.

#### Scenario: Excluded site
- **WHEN** `ai` is `true` and `privateSites` contains `example.ua`
- **AND** the page is `https://shop.example.ua/`
- **THEN** sending from that page is not allowed
- **AND** the local fixers still run on the page as usual

#### Scenario: Entry written differently
- **WHEN** `privateSites` contains `https://example.ua/`, `*.example.ua`, `.example.ua`, `EXAMPLE.UA` or `example.ua:8443`
- **THEN** pages on `example.ua` and its subdomains are excluded just the same

#### Scenario: Malformed exclusion list
- **WHEN** `privateSites` is not a list, or holds an entry that is not a hostname (such as `*example.ua`, `exa*mple.ua` or `example..ua`)
- **THEN** nothing is sent from any page until the setting is fixed

### Requirement: Private sections of public sites never share
Nothing SHALL be sent from private sections of otherwise public sites, identified by host and path prefix: direct messages on Facebook (`/messages`), Instagram (`/direct`), X (`/messages`, `/i/chat`) and LinkedIn (`/messaging`).

#### Scenario: Facebook messages
- **WHEN** `ai` is `true` and the page is `https://www.facebook.com/messages/t/1`
- **THEN** sending from that page is not allowed

#### Scenario: Disguised path
- **WHEN** the path is written as `/%6Dessages/t/1`, `/messages%2Ft/1`, `/messages;x` or `/messages.php`
- **THEN** it is treated as `/messages` and nothing is sent

#### Scenario: Public post on the same site
- **WHEN** `ai` is `true` and the page is a public post on `facebook.com`
- **THEN** sending from that page is allowed

### Requirement: Only the page host is sent about the page
About the page itself, only its hostname SHALL ever be sent, never its full URL, path, query or fragment.

#### Scenario: Password reset link
- **WHEN** an allowed request is made from `https://site.ua/reset?token=SECRET`
- **THEN** the request names the page only as `site.ua`
- **AND** `SECRET` never leaves the device

### Requirement: Pages with secret fields never share
Nothing SHALL be sent from a page that, at the moment of sending, contains a password field, a one-time-code field or a payment-card field, even on an otherwise public site.

#### Scenario: Checkout page on a public shop
- **WHEN** `ai` is `true` and a page on a public shop shows a field with `autocomplete="cc-number"`
- **THEN** nothing is sent from that page

#### Scenario: Embedded payment form
- **WHEN** a public shop's checkout embeds card fields in an iframe from a payment provider (such as Stripe, Braintree, Adyen, Google Pay or LiqPay)
- **THEN** nothing is sent from that page

#### Scenario: Password field inside a web component
- **WHEN** a page's password field is inside Shadow DOM
- **THEN** nothing is sent from that page

#### Scenario: Login form
- **WHEN** a public news site shows an `<input type="password">`
- **THEN** nothing is sent from that page

#### Scenario: Card fields without autocomplete or in a same-origin frame
- **WHEN** a checkout has fields named `cardNumber` and `cvv`, or a password field inside a same-origin iframe
- **THEN** nothing is sent from that page

### Requirement: Sites where Доступно is off never share
Nothing SHALL be sent from a site where the user turned Доступно off (`disabledSites`, matching the host and its subdomains) or when Доступно is turned off everywhere (`enabled: false`), even if AI descriptions are on.

#### Scenario: Site turned off
- **WHEN** `ai` is `true` and `disabledSites` contains `news.site.ua`
- **THEN** nothing is sent from pages of `news.site.ua`

### Requirement: Only public item URLs are sent
An item URL (such as an image source) SHALL be sent only if it is an http(s) URL on a public, non-private host and path (by the same rules as pages, including the user's settings) with no embedded credentials, no access-token, session, signature or personal-data parameters, and no fragment. `data:`, `blob:` and other schemes, and URLs that fail to parse, SHALL NOT be sent.

#### Scenario: Plain public image
- **WHEN** an allowed page has an image `https://cdn.site.ua/news/photo.jpg`
- **THEN** that URL may be sent

#### Scenario: Signed link to a private file
- **WHEN** an image URL carries a parameter such as `X-Amz-Signature`, `Signature`, `token`, `auth_token`, `access-token`, `secret`, `sig`, `key`, `code`, `otp`, `pwd`, `pin`, `ticket`, `email`, `phone`, or Facebook CDN's `oh`/`oe`, in any case, encoding or `[]` form, separated by `&` or `;`
- **THEN** that URL is not sent

#### Scenario: Session in the path or anything after the hash
- **WHEN** an image URL contains `;jsessionid=` in its path, or any fragment (`#key`, `#access_token=…`)
- **THEN** that URL is not sent

#### Scenario: Direct-message media and excluded hosts
- **WHEN** an image URL is on `ton.twitter.com` (X direct-message media), or on a host the user excluded or turned off
- **THEN** that URL is not sent

#### Scenario: Inline or local image
- **WHEN** an image source is a `data:` or `blob:` URL, or has a `user:pass@` part
- **THEN** that URL is not sent

#### Scenario: Image on an intranet host from a public page
- **WHEN** an allowed public page shows an image from `http://10.0.0.5/img.png`
- **THEN** that URL is not sent

### Requirement: Every network request passes the gate
Every code path that sends data to a server SHALL check the page rules immediately before sending, both in the page and again in the background using the tab URL reported by the browser. Any error or doubt during the check SHALL mean "do not send".

#### Scenario: Page claims to be somewhere else
- **WHEN** a page script tampers with values the content script reads, and a request reaches the background from a tab whose browser-reported URL is on `monobank.ua`
- **THEN** the background refuses to send it

#### Scenario: Check throws
- **WHEN** the gate throws on an unexpected URL
- **THEN** nothing is sent and the page keeps working

### Requirement: Private sites keep local fixes
Being private for sending SHALL NOT change which fixers run or what they do. On a private page the page is fixed locally exactly as on a public page.

#### Scenario: Fixing on a bank site
- **WHEN** the screen reader profile is on and the user opens an icon-only button on `privatbank.ua`
- **THEN** the button gets its local name as on any other site
- **AND** nothing about the page is sent anywhere

#### Scenario: Nothing to fix on a private page
- **WHEN** a private page has no accessibility problems
- **THEN** the page is left untouched and nothing is sent
