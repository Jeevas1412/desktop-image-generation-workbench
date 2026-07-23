import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createJobHistoryStore } from '../src/image/job-history-store.mjs';

test('persists only bounded task records under app-owned history storage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'job-history-'));
  try {
    const store = createJobHistoryStore({ userDataRoot: root });
    const jobs = [{ jobId: 'job_test1', state: 'generating', attempts: [] }];
    await store.save(jobs);
    assert.deepEqual(await store.load(), jobs);
    await assert.rejects(() => store.save([{ jobId: '../outside', state: 'x', attempts: [] }]), /JOB_HISTORY_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects an oversized history before writing its temporary file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'job-history-'));
  try {
    const store = createJobHistoryStore({ userDataRoot: root });
    await assert.rejects(() => store.save([{ jobId: 'job_large', state: 'failed', attempts: [], message: 'x'.repeat(9 * 1024 * 1024) }]), /JOB_HISTORY_TOO_LARGE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
