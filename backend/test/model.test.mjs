import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDescribeImage, parseResponse, cleanAlt, buildRequest, toBase64, PROMPT_VERSION } from '../src/model.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ok = (json) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(json) }] });

/** Fake SDK client recording requests. */
const fakeClient = (reply) => {
  const requests = [];
  return {
    requests,
    messages: {
      create: async (req) => {
        requests.push(req);
        if (reply instanceof Error) throw reply;
        return typeof reply === 'function' ? reply(req) : reply;
      },
    },
  };
};

test('builds a Haiku request: image as base64, low effort, JSON schema, no sampling params', () => {
  const req = buildRequest({ bytes: PNG, mediaType: 'image/png', context: ' Новини громади ' }, 'claude-haiku-5-5');
  assert.equal(req.model, 'claude-haiku-5-5');
  assert.equal(req.max_tokens, 1024);
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.format.schema.additionalProperties, false);
  assert.ok(!('temperature' in req) && !('top_p' in req) && !('thinking' in req));
  const [image, text] = req.messages[0].content;
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: toBase64(PNG) });
  assert.equal(text.text, 'Контекст сторінки: Новини громади');
  assert.equal(buildRequest({ bytes: PNG, mediaType: 'image/png', context: '' }, 'm').messages[0].content[1].text,
    'Контексту сторінки немає.');
});

test('toBase64 matches Node for large inputs', () => {
  const big = new Uint8Array(100_000).map((_, i) => i % 256);
  assert.equal(toBase64(big), Buffer.from(big).toString('base64'));
});

test('a normal answer is returned cleaned', async () => {
  const client = fakeClient(ok({ decorative: false, alt: 'На фото: діти саджають дерева біля школи' }));
  const d = makeDescribeImage({ model: 'claude-haiku-5-5', client });
  assert.deepEqual(await d({ bytes: PNG, mediaType: 'image/png', context: '' }),
    { alt: 'Діти саджають дерева біля школи', decorative: false });
  assert.equal(client.requests.length, 1);
});

test('decorative answer', () => {
  assert.deepEqual(parseResponse(ok({ decorative: true, alt: 'візерунок' })), { alt: '', decorative: true });
});

test('refusal, cut-off, bad JSON, empty or too long → null', () => {
  assert.equal(parseResponse({ stop_reason: 'refusal', content: [] }), null);
  assert.equal(parseResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"decorative":false,' }] }), null);
  assert.equal(parseResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Діти саджають дерева' }] }), null);
  assert.equal(parseResponse(ok({ decorative: false, alt: '   ' })), null);
  assert.equal(parseResponse(ok({ decorative: false, alt: 'Фото' })), null, 'only a label');
  assert.equal(parseResponse(ok({ decorative: false, alt: 'Д'.repeat(201) })), null);
  assert.equal(parseResponse(ok({ decorative: 'no', alt: 'x' })), null);
  assert.equal(parseResponse(ok({ decorative: false, alt: "Купуйте подарунки на Чонру п'яintцю" })), null, 'mixed-alphabet word');
  assert.deepEqual(parseResponse(ok({ decorative: false, alt: 'Реклама sweet.tv: тариф «M» замість «L»' })),
    { alt: 'Реклама sweet.tv: тариф «M» замість «L»', decorative: false }, 'Latin words next to Cyrillic ones are fine');
  assert.equal(parseResponse(null), null);
});

test('API errors give null and never escape', async () => {
  const d = makeDescribeImage({ model: 'm', client: fakeClient(new Error('401 invalid x-api-key')) });
  assert.equal(await d({ bytes: PNG, mediaType: 'image/png', context: '' }), null);
});

test('cleanAlt strips labels and quotes, keeps real content', () => {
  assert.equal(cleanAlt('Зображення: логотип Укрзалізниці'), 'Логотип Укрзалізниці');
  assert.equal(cleanAlt('«Жінка виступає з трибуни»'), 'Жінка виступає з трибуни');
  assert.equal(cleanAlt('"Мапа області"'), 'Мапа області');
  assert.equal(cleanAlt('Банер акції «Чорна п’ятниця»'), 'Банер акції «Чорна п’ятниця»', 'a quoted word at the end stays');
  assert.equal(cleanAlt('«Тариф «M»» за пів ціни'), '«Тариф «M»» за пів ціни', 'quotes not wrapping the whole sentence stay');
  assert.equal(cleanAlt('На зображенні   мапа  області'), 'Мапа області');
  assert.equal(cleanAlt('Фотограф знімає захід сонця'), 'Фотограф знімає захід сонця', 'not a label');
  assert.equal(cleanAlt('Картини Приймаченко на виставці'), 'Картини Приймаченко на виставці', 'not a label');
});

test('prompt version is a positive integer', () => {
  assert.ok(Number.isInteger(PROMPT_VERSION) && PROMPT_VERSION > 0);
});
