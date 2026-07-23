import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectRegisteredCore, registeredCoreByCandidateId, supportedCoreSelection } from '../src/image/core-model-registry.mjs';
import { ILLUSTRIOUS_CHECKPOINT, PONY_VAE } from '../src/image/workflow-builders.mjs';

test('only registered exact checkpoints receive a workflow-ready core classification', () => {
  const checkpoint = { candidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, directoryId: 'comfy.checkpoints', displayName: ILLUSTRIOUS_CHECKPOINT };
  const inspected = inspectRegisteredCore(checkpoint, [checkpoint, { candidateId: `comfy.vae:${PONY_VAE}` }]);
  assert.equal(inspected.coreId, 'illustrious-xl-v01');
  assert.equal(inspected.compatibility, 'workflow_ready');
  assert.equal(inspectRegisteredCore({ candidateId: 'comfy.checkpoints:unknown.safetensors', directoryId: 'comfy.checkpoints', displayName: 'unknown.safetensors' }, []), null);
  assert.equal(registeredCoreByCandidateId('comfy.checkpoints:unknown.safetensors'), null);
});

test('a saved selection must carry the matching registry identifier', () => {
  const id = `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`;
  assert.equal(supportedCoreSelection({ coreCandidateId: id, coreId: 'illustrious-xl-v01' })?.engine, 'illustrious');
  assert.equal(supportedCoreSelection({ coreCandidateId: id, coreId: 'pony-v6-xl' }), null);
});
