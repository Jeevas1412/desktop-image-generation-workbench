import assert from 'node:assert/strict';
import test from 'node:test';
import { createComfyUiConnectionVerifier } from '../src/image/comfyui-connection-verifier.mjs';

test('verifies only a resolved private ComfyUI address using the fixed read-only node route', async () => {
  const received = [];
  const verifier = createComfyUiConnectionVerifier({
    lookup: async () => ({ address: '192.168.10.8' }),
    fetchImpl: async (url, init) => { received.push({ url: String(url), init }); return { ok: true, json: async () => ({ system: {} }) }; },
  });
  assert.deepEqual(await verifier.verify({ host: 'comfyui.test', port: 8188 }), { service: 'comfyui', state: 'reachable', detail: 'ComfyUI 只读节点接口已验证；未提交任务、未修改队列。' });
  assert.equal(received[0].url, 'http://192.168.10.8:8188/object_info');
  assert.equal(received[0].init.method, 'GET');
});

test('accepts the non-public RFC 2544 DGX local fabric range', async () => {
  const received = [];
  const verifier = createComfyUiConnectionVerifier({
    lookup: async () => ({ address: '198.18.7.81' }),
    fetchImpl: async (url) => { received.push(String(url)); return { ok: true, json: async () => ({ system: {} }) }; },
  });
  assert.equal((await verifier.verify({ host: 'comfyui.test', port: 8188 })).state, 'reachable');
  assert.equal(received[0], 'http://198.18.7.81:8188/object_info');
});

test('exposes the resolved numeric endpoint as read-only verification evidence', async () => {
  const verifier = createComfyUiConnectionVerifier({
    lookup: async () => ({ address: '192.168.10.8' }),
    fetchImpl: async () => ({ ok: true, json: async () => ({ system: {} }) }),
  });
  const result = await verifier.inspect({ host: 'comfyui.test', port: 8189 });
  assert.equal(result.state, 'reachable');
  assert.equal(result.address, '192.168.10.8');
  assert.equal(result.port, 8189);
});

test('rejects public resolutions and never requests arbitrary paths or credentials', async () => {
  let requested = false;
  const verifier = createComfyUiConnectionVerifier({ lookup: async () => ({ address: '8.8.8.8' }), fetchImpl: async () => { requested = true; } });
  assert.deepEqual(await verifier.verify({ host: 'example.org', port: 8188 }), { service: 'comfyui', state: 'not_lan', detail: '仅允许连接局域网、回环或链路本地地址。' });
  assert.equal(requested, false);
  await assert.rejects(() => verifier.verify({ host: '192.168.1.3/path', port: 8188 }), /COMFYUI_CONNECTION_HOST_INVALID/);
  await assert.rejects(() => verifier.verify({ host: '192.168.1.3', port: 8188, token: 'x' }), /COMFYUI_CONNECTION_PROFILE_INVALID/);
});
