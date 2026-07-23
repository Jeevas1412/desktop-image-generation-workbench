import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageApplicationCore } from '../src/image/application-core.mjs';

test('routes each accepted action only to its named use case', async () => {
  const received = []; const core = createImageApplicationCore({ useCases: { capabilities: async () => ({ ready: true }), startJob: async (generation) => { received.push(generation); return { jobId: generation.jobId }; }, createSemifinishedCleanupPlan: async () => ({ planId: 'plan-1' }), confirmSemifinishedCleanup: async (planId) => ({ planId, removed: 2 }), verifyComfyUiConnection: async (profile) => ({ profile }) } });
  assert.deepEqual(await core.dispatch({ type: 'image:capabilities:get', payload: {} }), { ready: true });
  assert.deepEqual(await core.dispatch({ type: 'image:job:start', payload: { generation: { jobId: 'job-1' } } }), { jobId: 'job-1' });
  assert.deepEqual(received, [{ jobId: 'job-1' }]); assert.deepEqual(await core.dispatch({ type: 'library:semifinished:clear:plan', payload: {} }), { planId: 'plan-1' }); assert.deepEqual(await core.dispatch({ type: 'library:semifinished:clear:confirm', payload: { planId: 'plan-1' } }), { planId: 'plan-1', removed: 2 });
  assert.deepEqual(await core.dispatch({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.2', port: 8188 } } }), { profile: { host: '192.168.1.2', port: 8188 } });
});

test('never falls back to arbitrary methods or an implicit backend handler', async () => {
  const core = createImageApplicationCore();
  await assert.rejects(() => core.dispatch({ type: 'shell:execute', payload: {} }), /IMAGE_CORE_REQUEST_NOT_ALLOWED/);
  await assert.rejects(() => core.dispatch({ type: 'image:job:stop', payload: { jobId: 'job-1' } }), /IMAGE_CORE_USE_CASE_UNAVAILABLE/);
});
