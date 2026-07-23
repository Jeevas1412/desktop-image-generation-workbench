import assert from 'node:assert/strict';
import test from 'node:test';
import { createVlmTranslationService } from '../src/image/vlm-translation-service.mjs';

test('uses only fixed VLM model discovery and chat routes then returns a validated English prompt', async () => {
  const calls = [];
  const service = createVlmTranslationService({
    profileStore: { load: async () => ({ host: '192.168.10.8', port: 8003 }) },
    connectionVerifier: { inspect: async () => ({ state: 'reachable', address: '192.168.10.8', port: 8003, models: { data: [{ id: 'qwen3-vl' }] } }) },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"prompt":"a woman standing in rain"}' } }] }), { status: 200 });
    },
  });
  assert.deepEqual(await service.translate('雨中站立的女人'), { prompt: 'a woman standing in rain', model: 'qwen3-vl' });
  assert.deepEqual(calls, [{ url: 'http://192.168.10.8:8003/v1/chat/completions', method: 'POST' }]);
});

test('does not fetch when the current VLM endpoint is no longer a verified private address', async () => {
  let fetched = false;
  const service = createVlmTranslationService({
    profileStore: { load: async () => ({ host: '8.8.8.8', port: 8003 }) },
    connectionVerifier: { inspect: async () => ({ state: 'not_lan' }) },
    fetchImpl: async () => { fetched = true; throw new Error('must not fetch'); },
  });
  await assert.rejects(() => service.translate('人物在雨中'), /TRANSLATION_VLM_NOT_LAN/);
  assert.equal(fetched, false);
});
