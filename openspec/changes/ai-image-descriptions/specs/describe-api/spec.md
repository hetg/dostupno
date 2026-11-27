# Spec Delta

## Purpose

The Доступно backend's contract for describing images: what it accepts, what it refuses for privacy, how it fetches images and writes Ukrainian descriptions, and how it caches and fails.

## ADDED Requirements

### Requirement: Describe request and response
`POST /v1/describe` SHALL accept JSON `{ pageHost, lang, items: [{ imageUrl, context }] }` with 1 to 8 items, `context` up to 300 characters, and a body up to 16 KB. It SHALL answer `{ results: [...] }` with one result per item, in order, each `{ alt, decorative, source }`.

#### Scenario: Two images
- **WHEN** the extension sends two shareable image URLs from `news.site.ua`
- **THEN** the response has two results in the same order, each with `alt` (text or `null`), `decorative` (boolean) and `source` (`"cache"`, `"ai"`, `"refused"` or `"none"`)

#### Scenario: Malformed request
- **WHEN** the body is not JSON, has 0 or more than 8 items, a `context` over 300 characters, a body over 16 KB, or an unknown field type
- **THEN** the response is HTTP 400 and no image is fetched and no model is called

### Requirement: Private requests are refused server-side
The backend SHALL apply the same privacy rules as the extension. If `pageHost` is non-public or a built-in private site, every item is refused. Any `imageUrl` that the extension's item rules would refuse is refused too. Refused items get `{ alt: null, decorative: false, source: "refused" }` and are never fetched or sent to the model.

#### Scenario: Request from a bank page
- **WHEN** a request names `pageHost` `privatbank.ua`
- **THEN** every result is refused and nothing is fetched

#### Scenario: Signed image URL
- **WHEN** one item's `imageUrl` carries `X-Amz-Signature`
- **THEN** that item is refused and the other items are processed normally

### Requirement: Images are fetched safely
The backend SHALL answer within about 11 seconds (image fetch and model call each time out), so the extension's 15-second wait is never the limit. It SHALL fetch each image itself with a timeout, a 5 MB size limit, at most 3 redirects (each target re-checked by the item rules), and only JPEG, PNG, GIF or WebP content. Anything else gives `{ alt: null, source: "none" }` without calling the model.

#### Scenario: SVG logo
- **WHEN** an image URL returns `image/svg+xml`
- **THEN** the result has `alt: null` and the model is not called

#### Scenario: Redirect to an intranet host
- **WHEN** an image URL redirects to `http://10.0.0.5/a.jpg`
- **THEN** the redirect is not followed and the result has `alt: null`

### Requirement: Descriptions are short Ukrainian sentences
A description SHALL be one Ukrainian sentence of at most 150 characters, without a leading "Зображення", "Фото" or similar, describing what matters on the page. Text that is the main content of the image is transcribed. People are never identified from their appearance; a name is used only when the nearby text names the person shown. Purely ornamental images are reported as `decorative: true` with `alt: ""`.

#### Scenario: News photo
- **WHEN** the image shows children planting trees and the nearby text is about a school event
- **THEN** `alt` is like "Діти саджають дерева біля школи" and `decorative` is `false`

#### Scenario: Unknown person
- **WHEN** the image shows a person and the nearby text names no one
- **THEN** the description does not name or guess who it is

#### Scenario: Divider ornament
- **WHEN** the image is a decorative flourish
- **THEN** the result is `{ alt: "", decorative: true }`

### Requirement: Failures give no description
Any model refusal, error, timeout, or output that is empty, over 200 characters or not valid SHALL result in `{ alt: null, source: "none" }` for that item, never in invented or partial text. One item failing SHALL NOT fail the others.

#### Scenario: Model refuses
- **WHEN** the model declines one image
- **THEN** that item has `alt: null` and the other items still get descriptions

### Requirement: Descriptions are cached and shared
Successful descriptions SHALL be cached by a hash of the image URL, the context, and the prompt and model version, for at most 30 days, and served to later requests for the same image and context without fetching it or calling the model. Failures from unsupported images MAY be cached for at most one day; refusals and model errors SHALL NOT be cached.

#### Scenario: Second visitor
- **WHEN** a second request asks for an image described before with the same context, prompt and model version
- **THEN** the result has `source: "cache"` and the image is not fetched again

#### Scenario: Made-up context for a popular image
- **WHEN** someone sends a popular image URL with invented context naming a person
- **THEN** requests with the page's real context don't get that description

#### Scenario: Image that changes at a fixed URL
- **WHEN** a description is older than 30 days
- **THEN** the image is described again

#### Scenario: Prompt changed
- **WHEN** the prompt or model version changes
- **THEN** earlier cache entries are not used

### Requirement: The API key never leaves the backend
The model API key SHALL be read only from the backend's secrets (locally `backend/.dev.vars`, which git ignores) and SHALL never appear in responses, logs or the extension.

#### Scenario: Error response
- **WHEN** a model call fails with an authentication error
- **THEN** the item result is `alt: null` and nothing about the key is returned
