import assert from 'node:assert/strict';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { archiveImage, createSemifinishedCleanupService, listLibrary, selectReference } from '../src/image/library-store.mjs';

test('archives each generated image into the semifinished library without changing source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const source = path.join(root, 'generated.png'); const drafts = path.join(root, 'semifinished');
  try { await writeFile(source, 'image'); const target = await archiveImage({ sourcePath: source, libraryRoot: drafts, runId: 'run_1', attemptNumber: 2 }); assert.equal(path.basename(target), 'run_1_attempt_2.png'); assert.equal((await readFile(target, 'utf8')), 'image'); assert.deepEqual(await listLibrary(drafts), [{ libraryItemId: 'run_1_attempt_2.png', displayName: 'run_1_attempt_2.png' }]); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('selects only an existing same-root library reference', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const drafts = path.join(root, 'semifinished'); const source = path.join(root, 'draft.png');
  try { await writeFile(source, 'x'); const archived = await archiveImage({ sourcePath: source, libraryRoot: drafts, runId: 'run_4', attemptNumber: 1 }); assert.equal(await selectReference({ libraryRoot: drafts, libraryItemId: path.basename(archived) }), archived); await assert.rejects(() => selectReference({ libraryRoot: drafts, libraryItemId: '../outside.png' }), /LIBRARY_FILE_NAME_NOT_ALLOWED/); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects a linked library item and a target whose resolved path leaves the owned root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const drafts = path.join(root, 'semifinished'); const source = path.join(root, 'draft.png');
  try {
    await writeFile(source, 'x'); const archived = await archiveImage({ sourcePath: source, libraryRoot: drafts, runId: 'run_5', attemptNumber: 1 });
    const linkedLstat = async (target) => {
      const info = await lstat(target);
      return target === archived ? { ...info, isFile: () => true, isSymbolicLink: () => true } : info;
    };
    await assert.rejects(() => selectReference({ libraryRoot: drafts, libraryItemId: path.basename(archived) }, { lstatImpl: linkedLstat }), /LIBRARY_REFERENCE_LINK_NOT_ALLOWED/);
    await assert.rejects(() => selectReference({ libraryRoot: drafts, libraryItemId: path.basename(archived) }, {
      realpathImpl: async (target) => target === archived ? path.join(root, 'outside.png') : target,
    }), /LIBRARY_REFERENCE_PATH_NOT_ALLOWED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects an empty or relative library root instead of resolving it to the process directory', async () => {
  await assert.rejects(() => listLibrary(''), /LIBRARY_ROOT_REQUIRED/);
  await assert.rejects(() => listLibrary('.'), /LIBRARY_ROOT_NOT_ALLOWED/);
});

test('uses a short-lived exact cleanup plan and never recursively deletes the configured root', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const drafts = path.join(parent, 'semifinished'); const final = path.join(parent, 'final.png');
  try { await writeFile(final, 'final'); await writeFile(path.join(parent, 'temp.png'), 'wrong-root'); await archiveImage({ sourcePath: final, libraryRoot: drafts, runId: 'run_2', attemptNumber: 1 }); const cleanup = createSemifinishedCleanupService({ now: () => 1000, randomId: () => 'plan-1' }); const plan = await cleanup.createPlan({ libraryRoot: drafts }); assert.equal(plan.files.length, 1); assert.equal(plan.rejected.length, 0); assert.deepEqual(await cleanup.confirm({ libraryRoot: drafts, planId: 'plan-1' }), { removed: 1, totalBytes: 5 }); assert.equal((await listLibrary(drafts)).length, 0); assert.equal(await readFile(final, 'utf8'), 'final'); }
  finally { await rm(parent, { recursive: true, force: true }); }
});

test('removes review metadata only for the exact files deleted by a confirmed cleanup plan', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const drafts = path.join(parent, 'semifinished'); const source = path.join(parent, 'source.png');
  try {
    await writeFile(source, 'image'); const archived = await archiveImage({ sourcePath: source, libraryRoot: drafts, runId: 'run_6', attemptNumber: 1 }); let removedIds = [];
    const cleanup = createSemifinishedCleanupService({ now: () => 1000, randomId: () => 'plan-review', onRemoved: async (ids) => { removedIds = ids; } });
    await cleanup.createPlan({ libraryRoot: drafts }); await cleanup.confirm({ libraryRoot: drafts, planId: 'plan-review' });
    assert.deepEqual(removedIds, [path.basename(archived)]);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('blocks cleanup after content changes or if a link/non-library entry is present', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-library-')); const drafts = path.join(root, 'semifinished'); const source = path.join(root, 'source.png');
  try { await writeFile(source, 'image'); await archiveImage({ sourcePath: source, libraryRoot: drafts, runId: 'run_3', attemptNumber: 1 }); const cleanup = createSemifinishedCleanupService({ now: () => 1000, randomId: () => 'plan-2' }); const plan = await cleanup.createPlan({ libraryRoot: drafts }); await writeFile(path.join(drafts, 'unplanned.png'), 'x'); await assert.rejects(() => cleanup.confirm({ libraryRoot: drafts, planId: plan.planId }), /LIBRARY_CLEANUP_CONTENT_CHANGED/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
