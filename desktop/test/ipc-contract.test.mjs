import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageIpcDispatcher, validateImageIpcRequest } from '../src/ipc-contract.mjs';

test('accepts only fixed image-workbench IPC actions and exact action fields', () => {
  assert.deepEqual(validateImageIpcRequest({ type: 'image:job:stop', payload: { jobId: 'job_1' } }), { type: 'image:job:stop', payload: { jobId: 'job_1' } });
  assert.throws(() => validateImageIpcRequest({ type: 'desktop:api:request', payload: {} }), /IPC_REQUEST_NOT_ALLOWED/);
  assert.throws(() => validateImageIpcRequest({ type: 'image:job:start', payload: { generation: {}, url: 'http://elsewhere' } }), /IPC_FIELD_NOT_ALLOWED/);
});

test('uses a plan and planId confirmation for cleanup, and blocks credential-like fields', () => {
  assert.deepEqual(validateImageIpcRequest({ type: 'library:semifinished:clear:plan', payload: {} }), { type: 'library:semifinished:clear:plan', payload: {} });
  assert.throws(() => validateImageIpcRequest({ type: 'library:semifinished:clear:confirm', payload: {} }), /IPC_ID_INVALID/);
  assert.throws(() => validateImageIpcRequest({ type: 'image:job:start', payload: { generation: { prompt: 'x', api_token: 'secret' } } }), /IPC_FIELD_NOT_ALLOWED/);
});

test('accepts only a bounded prompt translation payload', () => {
  assert.deepEqual(validateImageIpcRequest({ type: 'prompt:translate', payload: { text: '雨中的人物，电影感' } }), { type: 'prompt:translate', payload: { text: '雨中的人物，电影感' } });
  assert.throws(() => validateImageIpcRequest({ type: 'prompt:translate', payload: { text: '' } }), /IPC_TRANSLATION_TEXT_INVALID/);
});

test('accepts only a bounded ComfyUI LAN address and port profile', () => {
  assert.deepEqual(validateImageIpcRequest({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8188 } } }), { type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8188 } } });
  assert.throws(() => validateImageIpcRequest({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8188, password: 'x' } } }), /IPC_FIELD_NOT_ALLOWED/);
  assert.deepEqual(validateImageIpcRequest({ type: 'comfyui:profile:save', payload: { profile: { host: '192.168.1.20', port: 8188 } } }).type, 'comfyui:profile:save');
  assert.equal(validateImageIpcRequest({ type: 'comfyui:readonly:scan', payload: {} }).type, 'comfyui:readonly:scan');
  assert.equal(validateImageIpcRequest({ type: 'model:selection:get', payload: {} }).type, 'model:selection:get');
  assert.deepEqual(validateImageIpcRequest({ type: 'model:selection:save', payload: { selection: { coreCandidateId: 'comfy.checkpoints:pony.safetensors' } } }).payload.selection, { coreCandidateId: 'comfy.checkpoints:pony.safetensors' });
  assert.throws(() => validateImageIpcRequest({ type: 'model:selection:save', payload: { selection: { coreCandidateId: 'x', token: 'x' } } }), /IPC_FIELD_NOT_ALLOWED/);
});

test('dispatcher validates before invoking backend dispatch', async () => {
  let received; const dispatcher = createImageIpcDispatcher({ dispatch: async (request) => { received = request; return { ok: true }; } });
  assert.deepEqual(await dispatcher.request({ type: 'library:list', payload: { kind: 'semifinished' } }), { ok: true }); assert.equal(received.type, 'library:list');
});

test('admits only a bounded generation payload', () => {
  const generation = { prompt: 'a small test scene', negativePrompt: '', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5, seedMode: 'increment', loraName: '', loraModelStrength: 0.8, loraClipStrength: 0.8, ponySourceTag: 'source_anime', ponyRatingTag: 'rating_safe' };
  assert.deepEqual(validateImageIpcRequest({ type: 'image:job:start', payload: { generation } }).payload.generation, generation);
  assert.throws(() => validateImageIpcRequest({ type: 'image:job:start', payload: { generation: { ...generation, modelName: 'outside.safetensors' } } }), /IPC_GENERATION_FIELD_NOT_ALLOWED/);
  assert.equal(validateImageIpcRequest({ type: 'image:job:start', payload: { generation: { ...generation, loraName: 'SDXL/style/example.safetensors' } } }).payload.generation.loraName, 'SDXL/style/example.safetensors');
  assert.throws(() => validateImageIpcRequest({ type: 'image:job:start', payload: { generation: { ...generation, loraName: '../outside.safetensors' } } }), /IPC_GENERATION_LORA_INVALID/);
  assert.throws(() => validateImageIpcRequest({ type: 'image:job:start', payload: { generation: { ...generation, ponyRatingTag: 'invented' } } }), /IPC_GENERATION_PONY_TAG_INVALID/);
});
