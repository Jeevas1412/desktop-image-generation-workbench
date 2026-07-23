import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FIXED_DISCOVERY_ENDPOINTS,
  candidatesFromComfyObjectInfo,
  candidatesFromVlmModels,
  createFixedModelDiscovery,
  unavailableModelDiscovery,
} from '../src/image/fixed-model-discovery.mjs';

const objectInfoFixture = {
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [['pony.safetensors', 'illustrious.safetensors']] } } },
  UNETLoader: { input: { required: { unet_name: [['flux.safetensors']] } } },
  VAELoader: { input: { required: { vae_name: [['ae.safetensors']] } } },
  DualCLIPLoader: { input: { required: { clip_name1: [['clip_l.safetensors']], clip_name2: [['t5xxl_fp16.safetensors']] } } },
  LoraLoader: { input: { required: { lora_name: [['SDXL/portrait.safetensors', 'Flux/style.safetensors', 'legacy.safetensors']] } } },
};

test('maps only fixed ComfyUI selector fields into fixed directory IDs', () => {
  assert.deepEqual(candidatesFromComfyObjectInfo(objectInfoFixture), [
    { candidateId: 'comfy.checkpoints:illustrious.safetensors', displayName: 'illustrious.safetensors', directoryId: 'comfy.checkpoints', source: 'comfy-object-info' },
    { candidateId: 'comfy.checkpoints:pony.safetensors', displayName: 'pony.safetensors', directoryId: 'comfy.checkpoints', source: 'comfy-object-info' },
    { candidateId: 'comfy.loras:legacy.safetensors', displayName: 'legacy.safetensors', directoryId: 'comfy.loras', source: 'comfy-object-info' },
    { candidateId: 'comfy.loras.flux:Flux/style.safetensors', displayName: 'Flux/style.safetensors', directoryId: 'comfy.loras.flux', source: 'comfy-object-info' },
    { candidateId: 'comfy.loras.sdxl:SDXL/portrait.safetensors', displayName: 'SDXL/portrait.safetensors', directoryId: 'comfy.loras.sdxl', source: 'comfy-object-info' },
    { candidateId: 'comfy.text_encoders:clip_l.safetensors', displayName: 'clip_l.safetensors', directoryId: 'comfy.text_encoders', source: 'comfy-object-info' },
    { candidateId: 'comfy.text_encoders:t5xxl_fp16.safetensors', displayName: 't5xxl_fp16.safetensors', directoryId: 'comfy.text_encoders', source: 'comfy-object-info' },
    { candidateId: 'comfy.unet:flux.safetensors', displayName: 'flux.safetensors', directoryId: 'comfy.unet', source: 'comfy-object-info' },
    { candidateId: 'comfy.vae:ae.safetensors', displayName: 'ae.safetensors', directoryId: 'comfy.vae', source: 'comfy-object-info' },
  ]);
});

test('maps only model identifiers from VLM data and rejects malformed payloads', () => {
  assert.deepEqual(candidatesFromVlmModels({ data: [{ id: 'qwen3-vl-8b-fp8' }, { id: 'qwen3-vl-8b-fp8' }, { ignored: true }] }), [
    { candidateId: 'vlm.registry:qwen3-vl-8b-fp8', displayName: 'qwen3-vl-8b-fp8', directoryId: 'vlm.registry', source: 'vlm-models' },
  ]);
  assert.throws(() => candidatesFromVlmModels({}), /data array/);
  assert.throws(() => candidatesFromComfyObjectInfo([]), /must be an object/);
});

test('requests only fixed GET endpoints and does not accept renderer-controlled targets', async () => {
  const calls = [];
  const discover = createFixedModelDiscovery({
    now: () => new Date('2026-07-20T12:00:00.000Z'),
    requestJson: async (request) => {
      calls.push(request);
      return request.endpoint === FIXED_DISCOVERY_ENDPOINTS.comfyObjectInfo ? objectInfoFixture : { data: [{ id: 'qwen3-vl-8b-fp8' }] };
    },
  });
  const result = await discover();
  assert.equal(result.status, 'scanned');
  assert.equal(result.candidates.length, 10);
  assert.deepEqual(calls, [
    { method: 'GET', endpoint: '/object_info' },
    { method: 'GET', endpoint: '/v1/models' },
  ]);
});

test('exposes an explicit unavailable state before a fixed connection is configured', () => {
  assert.deepEqual(unavailableModelDiscovery('2026-07-20T12:00:00.000Z'), {
    schemaVersion: 1,
    checkedAt: '2026-07-20T12:00:00.000Z',
    status: 'unknown',
    candidates: [],
    blockingReasons: ['DISCOVERY_NOT_CONFIGURED'],
  });
});
