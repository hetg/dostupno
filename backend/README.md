# Backend (planned, weekend 2)

Not built yet. This is the contract the extension will use.

## Why a backend
- Users never handle API keys.
- Shared cache: the first visitor pays for the AI call, everyone after gets the result instantly.
- Crowd corrections: users report wrong labels; corrections beat AI output.

## Endpoints (draft)
`POST /v1/describe`
```json
{
  "items": [
    { "kind": "alt", "imageUrl": "https://site.ua/img/a.jpg", "context": "nearby heading or paragraph, max 300 chars", "pageLang": "uk" },
    { "kind": "name", "html": "<button class=\"icon-x\"><svg>…</svg></button>", "context": "…", "pageLang": "uk" }
  ]
}
```
Response:
```json
{ "results": [ { "text": "Діти саджають дерева біля школи", "decorative": false, "source": "cache|ai|human" } ] }
```

`POST /v1/report` — user says a label is wrong (`{ key, suggested? }`).

## Rules
- Never accept full page HTML. Only the item and a short context string.
- Refuse requests from excluded domains (banks, Diia, mail, medical) even if the extension sends them.
- Cache key: sha256 of image URL (alt) or of site + normalized element HTML (name).
- Alt text style: Ukrainian, 1 sentence, under 150 chars, no "Зображення…" prefix, say "декоративне" when it is.

## Suggested stack
Node + Fastify (or Hono on Cloudflare Workers), SQLite/Postgres for the cache, a vision-capable LLM API.
