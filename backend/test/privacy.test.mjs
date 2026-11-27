import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privacy } from '../src/privacy.js';

test('the backend uses the extension privacy gate', () => {
  assert.equal(typeof privacy.mayShareUrl, 'function');
  assert.equal(privacy.mayShareFrom('https://privatbank.ua/', { ai: true }), false);
  assert.equal(privacy.mayShareUrl('https://cdn.site.ua/news/photo.jpg'), true);
  assert.equal(privacy.mayShareUrl('https://bucket.s3.amazonaws.com/a.jpg?X-Amz-Signature=x'), false);
});
