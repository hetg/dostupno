# Spec Delta

## MODIFIED Requirements

### Requirement: Pages with secret fields never share
Nothing SHALL be sent from a page that, at the moment of sending, shows a password field, a one-time-code field or a payment-card field, or embeds a payment form, even on an otherwise public site. A field counts while it is rendered (laid out and not `visibility: hidden`), including off-screen or transparent fields; fields that are not rendered, such as those in a closed login dialog, do not count.

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

#### Scenario: Closed login dialog on a news homepage
- **WHEN** a news homepage has a login dialog that is closed (its password field is not rendered)
- **THEN** the page may send, as long as every other rule allows it

#### Scenario: Login dialog opened
- **WHEN** the user opens that login dialog, so its password field is rendered
- **THEN** nothing more is sent from that page while it stays open

## ADDED Requirements

### Requirement: Image context is minimal nearby text
Besides an image's URL, the only text sent with it SHALL be at most 300 characters of visible text near that image: its title, figure caption, the heading or short text (up to 200 characters) of the card around it, and its section's heading. It is about the image, not the page; the page itself is still named only by its host.

#### Scenario: News card
- **WHEN** a flagged photo sits in a card whose headline is "Ремонт дороги на вулиці Шевченка"
- **THEN** the context sent with it contains that headline and nothing longer than 300 characters

### Requirement: Context never carries hidden or personal text
Context SHALL NOT include form field values, the page title, text from `script`, `style`, `noscript`, `template`, hidden or `aria-hidden` elements, or any text containing an e-mail address, phone number or URL. Images in the site header or navigation and people's avatars or profile pictures SHALL NOT be sent at all.

#### Scenario: Lazy-load fallback markup
- **WHEN** a card contains `<noscript><img src="https://cdn.example.ua/full.jpg?token=abc123"></noscript>`
- **THEN** neither that markup nor its URL is part of any context

#### Scenario: Signed-in user's name and e-mail
- **WHEN** a header shows the user's avatar next to "Олена Петренко olena.p@gmail.com"
- **THEN** the avatar is not sent and the e-mail address never appears in any context

