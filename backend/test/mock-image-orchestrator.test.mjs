import assert from 'node:assert/strict';
import test from 'node:test';
import { runMockImageJob } from '../src/image/mock-image-orchestrator.mjs';

test('runs a mock FLUX workflow through submit and VLM review without contacting DGX', async () => {
  const calls = []; const result = await runMockImageJob({ generation: { jobId: 'mock-1', engine: 'flux', prompt: 'a red product', rounds: 5, seedMode: 'increment', seed: 10 }, submitWorkflow: async (workflow, context) => { calls.push({ workflow, context }); return { promptId: `mock-${context.round}` }; }, review: async () => ({ pass: true, score: 90 }) });
  assert.equal(result.status, 'completed'); assert.equal(result.attempts.length, 1); assert.equal(result.attempts[0].promptId, 'mock-1'); assert.equal(calls[0].workflow['1'].class_type, 'UNETLoader');
});

test('honors a stop request before a second mock submission', async () => {
  let submitted = 0; const result = await runMockImageJob({ generation: { jobId: 'mock-2', engine: 'pony', prompt: 'character', rounds: 5, seedMode: 'locked', seed: 3 }, submitWorkflow: async () => { submitted += 1; return { promptId: 'mock' }; }, review: async () => ({ pass: false, score: 20 }), shouldStop: (state) => state.currentRound >= 1 });
  assert.equal(submitted, 1); assert.equal(result.status, 'stopped');
});
