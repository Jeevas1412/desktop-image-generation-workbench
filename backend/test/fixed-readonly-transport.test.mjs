import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedReadonlyRequest } from '../src/image/fixed-readonly-transport.mjs';

test('uses configured bases with fixed GET routes only', async () => {
  const calls = [];
  const request = createFixedReadonlyRequest({
    comfyBaseUrl: 'http://comfy.internal:8188',
    vlmBaseUrl: 'http://vlm.internal:8003/v1',
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  await request({ method: 'GET', endpoint: '/object_info' });
  await request({ method: 'GET', endpoint: '/v1/models' });
  assert.deepEqual(calls, [
    { url: 'http://comfy.internal:8188/object_info', init: { method: 'GET', headers: { accept: 'application/json' } } },
    { url: 'http://vlm.internal:8003/v1/models', init: { method: 'GET', headers: { accept: 'application/json' } } },
  ]);
});

test('rejects arbitrary method, endpoint, and non-http base configuration', async () => {
  const request = createFixedReadonlyRequest({
    comfyBaseUrl: 'http://comfy.internal:8188',
    vlmBaseUrl: 'http://vlm.internal:8003/v1',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  });
  await assert.rejects(() => request({ method: 'POST', endpoint: '/object_info' }), /GET only/);
  await assert.rejects(() => request({ method: 'GET', endpoint: '/arbitrary-path' }), /not allowed/);
  assert.throws(() => createFixedReadonlyRequest({ comfyBaseUrl: 'file:///tmp', vlmBaseUrl: 'http://vlm.internal', fetchImpl: async () => ({}) }), /http or https/);
});

test('returns a clear failure for a non-success response without exposing body data', async () => {
  const request = createFixedReadonlyRequest({
    comfyBaseUrl: 'http://comfy.internal:8188',
    vlmBaseUrl: 'http://vlm.internal:8003/v1',
    fetchImpl: async () => ({ ok: false, json: async () => ({ sensitive: 'do-not-return' }) }),
  });
  await assert.rejects(() => request({ method: 'GET', endpoint: '/object_info' }), /request failed/);
});
