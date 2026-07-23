import assert from 'node:assert/strict';
import test from 'node:test';
import { createComfyUiReadonlyScan } from '../src/image/comfyui-readonly-scan.mjs';

test('maps only verifier-returned object_info into real candidates and queue counts', async () => {
  const scan = createComfyUiReadonlyScan({ verifier: { inspect: async () => ({ service: 'comfyui', state: 'reachable', address: '192.168.10.8', port: 8189, objectInfo: { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['real.safetensors']] } } } }, queue: { running: 1, pending: 2 }, detail: 'ok' }) } });
  const result = await scan.scan({ host: '127.0.0.1', port: 8188 });
  assert.deepEqual(result.queue, { running: 1, pending: 2 });
  assert.equal(result.address, '192.168.10.8');
  assert.equal(result.port, 8189);
  assert.equal(result.candidates[0].displayName, 'real.safetensors');
});
