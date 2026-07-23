import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createModelSelectionStore } from '../src/image/model-selection-store.mjs';

test('persists registered-core verification evidence and reads legacy selections safely', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'model-selection-'));
  try {
    const store = createModelSelectionStore({ userDataRoot: root });
    assert.equal(await store.load(), null);
    const saved = await store.save({ coreCandidateId: 'comfy.checkpoints:pony.safetensors', coreId: 'pony-v6-xl', verifiedAt: '2026-07-22T00:00:00.000Z', verification: { source: 'comfy-object-info', compatibility: 'workflow_ready', missingResources: [] } });
    assert.equal(saved.coreId, 'pony-v6-xl');
    assert.equal((await store.load()).verification.compatibility, 'workflow_ready');
    await assert.rejects(() => store.save({ coreCandidateId: 'x', token: 'x' }), /MODEL_SELECTION_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
