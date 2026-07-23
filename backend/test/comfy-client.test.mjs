import assert from 'node:assert/strict';
import test from 'node:test';
import { createComfyClient } from '../src/image/comfy-client.mjs';

function jsonResponse(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

test('uses only fixed queue, prompt, history, view, upload, and interrupt APIs', async () => {
  const calls = [];
  const client = createComfyClient({
    comfyBaseUrl: 'http://comfy.internal:8188',
    fetchImpl: async (url, init) => { calls.push({ url: url.toString(), init }); return jsonResponse({ ok: true }); },
  });
  await client.queue();
  await client.submitPrompt({ '1': { class_type: 'KSampler' } }, 'image-studio');
  await client.history('prompt-123');
  await client.view({ filename: 'result.png', subfolder: 'run-1', type: 'output' });
  await client.uploadImage({ fileName: 'reference.png', blob: new Blob(['image']) });
  await client.interrupt();
  assert.deepEqual(calls.map((call) => [call.url, call.init.method ?? 'GET']), [
    ['http://comfy.internal:8188/queue', 'GET'],
    ['http://comfy.internal:8188/prompt', 'POST'],
    ['http://comfy.internal:8188/history/prompt-123', 'GET'],
    ['http://comfy.internal:8188/view?filename=result.png&subfolder=run-1&type=output', 'GET'],
    ['http://comfy.internal:8188/upload/image', 'POST'],
    ['http://comfy.internal:8188/interrupt', 'POST'],
  ]);
});

test('rejects renderer-like unsafe values before making a request', async () => {
  let called = false;
  const client = createComfyClient({ comfyBaseUrl: 'http://comfy.internal:8188', fetchImpl: async () => { called = true; return jsonResponse({}); } });
  await assert.rejects(() => client.history('../other-task'), /PROMPT_ID_NOT_ALLOWED/);
  await assert.rejects(() => client.view({ filename: '../outside.png' }), /FILE_NAME_NOT_ALLOWED/);
  await assert.rejects(() => client.view({ filename: 'ok.png', subfolder: '../outside' }), /SUBFOLDER_NOT_ALLOWED/);
  await assert.rejects(() => client.submitPrompt([], 'browser'), /WORKFLOW_INVALID/);
  assert.equal(called, false);
});

test('returns bounded failure reasons for timeout and HTTP failures', async () => {
  const timeoutClient = createComfyClient({ comfyBaseUrl: 'http://comfy.internal:8188', timeoutMs: 5, fetchImpl: async () => new Promise(() => {}) });
  await assert.rejects(() => timeoutClient.queue(), /COMFY_TIMEOUT/);
  const failingClient = createComfyClient({ comfyBaseUrl: 'http://comfy.internal:8188', fetchImpl: async () => jsonResponse({ internal: 'not exposed' }, 503) });
  await assert.rejects(() => failingClient.queue(), /COMFY_HTTP_503/);
});
