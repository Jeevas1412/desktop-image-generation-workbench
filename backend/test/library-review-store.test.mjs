import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLibraryReviewStore } from '../src/image/library-review-store.mjs';

test('persists only a bounded review keyed by a safe library item id', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-review-'));
  try {
    const store = createLibraryReviewStore({ userDataRoot: root });
    await store.set('job_1_attempt_1.png', { state: 'completed', score: 92, pass: true, summary: '清晰', issues: [], hard_failures: [], prompt_patch: 'wider shot', model: 'qwen-vl' });
    assert.equal((await store.list())['job_1_attempt_1.png'].score, 92);
    assert.deepEqual(await store.removeMany(['job_1_attempt_1.png']), { removed: 1 });
    assert.deepEqual(await store.list(), {});
    await assert.rejects(() => store.set('../outside.png', { state: 'completed' }), /ITEM_ID_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
