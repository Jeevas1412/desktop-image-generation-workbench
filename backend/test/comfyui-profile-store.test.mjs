import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createComfyUiProfileStore } from '../src/image/comfyui-profile-store.mjs';

test('persists only a bounded no-credential ComfyUI host and port profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'comfy-profile-'));
  try {
    const store = createComfyUiProfileStore({ userDataRoot: root });
    assert.equal(await store.load(), null);
    assert.deepEqual(await store.save({ host: '192.168.1.20', port: 8188 }), { host: '192.168.1.20', port: 8188 });
    assert.deepEqual(await store.load(), { host: '192.168.1.20', port: 8188 });
    await assert.rejects(() => store.save({ host: '192.168.1.20', port: 8188, token: 'x' }), /COMFYUI_PROFILE_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
