import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { beginRound, completeRound, createImageJob, createSeedPlan, loadManifest, requestStop, saveManifest } from '../src/image/job-controller.mjs';

test('supports only 5/25 rounds and three deterministic seed modes', () => {
  assert.deepEqual(createSeedPlan({ mode: 'locked', seed: 8, rounds: 5 }), [8, 8, 8, 8, 8]);
  assert.deepEqual(createSeedPlan({ mode: 'increment', seed: 8, rounds: 5 }), [8, 9, 10, 11, 12]);
  assert.deepEqual(createSeedPlan({ mode: 'range_increment', rangeStart: 3, rangeEnd: 5, rounds: 5 }), [3, 4, 5, 3, 4]);
  assert.throws(() => createSeedPlan({ rounds: 6 }), /JOB_ROUNDS_NOT_ALLOWED/);
});

test('permits only the owning application to advance or stop a job', () => {
  const job = createImageJob({ jobId: 'job-1', ownerId: 'image-studio', rounds: 5, seedMode: 'increment', seed: 10 });
  assert.throws(() => beginRound(job, 'other-app'), /JOB_NOT_OWNED/);
  const running = beginRound(job, 'image-studio'); assert.deepEqual(running.attempts[0], { round: 1, seed: 10, status: 'generating' });
  const stopped = requestStop(running, 'image-studio'); const done = completeRound(stopped, 'image-studio', { promptId: 'prompt-1' });
  assert.equal(done.status, 'stopped'); assert.equal(done.attempts[0].status, 'stopped');
});

test('atomically saves and restores a job manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-job-'));
  try {
    const job = completeRound(beginRound(createImageJob({ jobId: 'job-2', ownerId: 'image-studio', rounds: 5, seed: 22 }), 'image-studio'), 'image-studio', { promptId: 'prompt-2', artifact: { name: 'image.png' } });
    await saveManifest(root, job); const restored = await loadManifest(root, 'job-2');
    assert.deepEqual(restored, job);
  } finally { await rm(root, { recursive: true, force: true }); }
});
