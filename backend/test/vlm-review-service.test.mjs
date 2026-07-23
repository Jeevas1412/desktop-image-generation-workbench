import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createVlmReviewService } from '../src/image/vlm-review-service.mjs';

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+qXEAAAAASUVORK5CYII=', 'base64');

test('reports an explicit unavailable review when VLM has not been configured', async () => {
  const service = createVlmReviewService({ profileStore: { load: async () => null }, connectionVerifier: { inspect: async () => ({ state: 'unreachable' }) } });
  const review = await service.review({ imagePath: 'C:\\not-used.png', requirement: 'a landscape' });
  assert.equal(review.state, 'unavailable');
  assert.match(review.detail, /未运行/);
});

test('sends the generated image to the verified VLM and returns only its real review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vlm-review-'));
  try {
    const imagePath = path.join(root, 'generated.png');
    await writeFile(imagePath, onePixelPng);
    const calls = [];
    const service = createVlmReviewService({
      profileStore: { load: async () => ({ host: '192.168.1.20', port: 8003 }) },
      connectionVerifier: { inspect: async () => ({ state: 'reachable', address: '192.168.1.20', port: 8003, models: { data: [{ id: 'qwen-vl' }] } }) },
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 87, hard_failures: [], issues: ['构图稳定'], prompt_patch: 'wider establishing shot', summary: '符合提示词。' }) } }] }), { status: 200 });
      },
    });
    const review = await service.review({ imagePath, requirement: 'an animal in a forest', threshold: 80 });
    assert.equal(review.state, 'completed');
    assert.equal(review.score, 87);
    assert.equal(review.pass, true);
    assert.equal(review.model, 'qwen-vl');
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'qwen-vl');
    assert.match(body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
