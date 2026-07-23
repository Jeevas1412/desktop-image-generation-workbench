import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstallPlan } from '../src/image/install-planner.mjs';

const catalog = {
  artifacts: [
    { artifactId: 'pony', targetDirectoryId: 'comfy.checkpoints', expectedFileName: 'pony.safetensors', distribution: { status: 'downloadable', sourceUrl: 'https://example.invalid/pony', sha256: 'a'.repeat(64), sizeBytes: 1000, license: 'Example', acknowledgementRequired: false } },
    { artifactId: 'vae', targetDirectoryId: 'comfy.vae', expectedFileName: 'vae.safetensors', distribution: { status: 'downloadable', sourceUrl: 'https://example.invalid/vae', sha256: 'b'.repeat(64), sizeBytes: 500, license: 'Example', acknowledgementRequired: true } },
    { artifactId: 'flux', targetDirectoryId: 'comfy.unet', expectedFileName: 'flux.safetensors', distribution: { status: 'manual-import-only', sourceUrl: 'https://example.invalid/flux', sha256: 'c'.repeat(64), sizeBytes: 9000, license: 'Restricted' } },
  ],
};

const idleState = { queue: { running: 0, pending: 0 }, availableDiskBytes: 2 * 1024 ** 3, existingArtifacts: {} };

test('creates a confirmation-only plan from fixed catalog IDs and reuses matching artifacts', () => {
  const plan = createInstallPlan({
    catalog, artifactIds: ['pony', 'vae'],
    systemState: { ...idleState, existingArtifacts: { vae: 'matching' } },
    now: () => new Date('2026-07-20T14:00:00.000Z'),
  });
  assert.equal(plan.state, 'awaiting-confirmation');
  assert.equal(plan.downloadBytes, 1000);
  assert.equal(plan.items[0].targetDirectoryId, 'comfy.checkpoints');
  assert.equal(plan.items[1].action, 'reuse');
  assert.equal(plan.items[1].acknowledgementRequired, true);
  assert.match(plan.planId, /^install-\d+$/);
});

test('blocks a busy queue, restricted source, conflicting file, arbitrary id, and insufficient disk', () => {
  assert.throws(() => createInstallPlan({ catalog, artifactIds: ['pony'], systemState: { ...idleState, queue: { running: 1, pending: 0 } } }), /QUEUE_BUSY/);
  assert.throws(() => createInstallPlan({ catalog, artifactIds: ['flux'], systemState: idleState }), /SOURCE_REQUIRES_MANUAL_IMPORT/);
  assert.throws(() => createInstallPlan({ catalog, artifactIds: ['pony'], systemState: { ...idleState, existingArtifacts: { pony: 'conflict' } } }), /TARGET_CONFLICT/);
  assert.throws(() => createInstallPlan({ catalog, artifactIds: ['arbitrary-model-name'], systemState: idleState }), /UNKNOWN_ARTIFACT/);
  assert.throws(() => createInstallPlan({ catalog, artifactIds: ['pony'], systemState: { ...idleState, availableDiskBytes: 1 } }), /INSUFFICIENT_DISK/);
});
