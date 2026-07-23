import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRealGenerationService, createSeedPlan, normalizeGeneration } from '../src/image/real-generation-service.mjs';
import { FLUX_CHECKPOINT, FLUX_CLIP_L, FLUX_T5, FLUX_UNET, FLUX_VAE, ILLUSTRIOUS_CHECKPOINT, PONY_VAE } from '../src/image/workflow-builders.mjs';

const profileStore = { load: async () => ({ host: '192.168.10.8', port: 8189 }) };
const modelSelectionStore = { load: async () => ({ coreCandidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, coreId: 'illustrious-xl-v01' }) };
const readonlyScan = { scan: async () => ({ state: 'reachable', address: '192.168.10.8', port: 8189, queue: { running: 0, pending: 0 }, candidates: [
  { candidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, directoryId: 'comfy.checkpoints' },
  { candidateId: `comfy.vae:${PONY_VAE}`, directoryId: 'comfy.vae' },
  { displayName: 'style.safetensors', directoryId: 'comfy.loras.sdxl' },
] }) };

test('normalizes the only generation fields accepted by the real submitter', () => {
  assert.equal(normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1 }).prompt, 'scene');
  assert.deepEqual(createSeedPlan({ mode: 'range_increment', rangeStart: 8, rangeEnd: 10, seed: 8, rounds: 5 }), [8, 9, 10, 8, 9]);
  assert.throws(() => normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, checkpointName: 'outside' }), /FIELD_NOT_ALLOWED/);
  assert.equal(normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, loraName: 'SDXL/style/example.safetensors' }).loraName, 'SDXL/style/example.safetensors');
  assert.throws(() => normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, loraName: '../outside.safetensors' }), /LORA_INVALID/);
  const pony = normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, ponySourceTag: 'source_anime', ponyRatingTag: 'rating_questionable' });
  assert.equal(pony.ponySourceTag, 'source_anime'); assert.equal(pony.ponyRatingTag, 'rating_questionable');
  assert.throws(() => normalizeGeneration({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, ponyRatingTag: 'invented' }), /PONY_TAG_INVALID/);
});

test('rejects a discovered LoRA unless it is in ComfyUI explicit SDXL directory', async () => {
  const incompatibleScan = { scan: async () => ({ state: 'reachable', address: '192.168.10.8', port: 8189, queue: { running: 0, pending: 0 }, candidates: [
    { candidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, directoryId: 'comfy.checkpoints' },
    { candidateId: `comfy.vae:${PONY_VAE}`, directoryId: 'comfy.vae' },
    { displayName: 'Flux/pose.safetensors', directoryId: 'comfy.loras.flux' },
  ] }) };
  const service = createRealGenerationService({ profileStore, modelSelectionStore, readonlyScan: incompatibleScan });
  await assert.rejects(() => service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, loraName: 'Flux/pose.safetensors' }), /GENERATION_LORA_INCOMPATIBLE/);
});

test('runs only one idle discovered Illustrious prompt at a time for all requested rounds', async () => {
  const submitted = [];
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan,
    randomId: () => '00000000-0000-0000-0000-000000000001', now: () => '2026-07-21T00:00:00.000Z',
    sleepImpl: async () => {},
    clientFactory: () => ({
      submitPrompt: async (workflow, clientId) => { submitted.push({ workflow, clientId }); return { prompt_id: 'prompt_1' }; },
      history: async () => ({ prompt_1: { status: { status_str: 'success', completed: true }, outputs: { '8': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } }),
    }),
  });
  const started = await service.start({ prompt: 'a city', negativePrompt: '', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5, seedMode: 'increment', loraName: 'style.safetensors', loraModelStrength: 0.7, loraClipStrength: 0.7 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(['queued', 'waiting_for_queue', 'submitting', 'generating', 'completed'].includes(started.state)); assert.equal(submitted.length, 5); assert.equal(submitted[0].workflow['1'].inputs.ckpt_name, ILLUSTRIOUS_CHECKPOINT);
  const job = await service.get(started.jobId);
  assert.equal(job.state, 'completed'); assert.equal(job.attempts.length, 5); assert.deepEqual(job.attempts[0].outputs, [{ filename: 'out.png', subfolder: '', type: 'output' }]);
});

test('pins generation requests to the numeric endpoint returned by the first scan', async () => {
  const bases = [];
  const hostnameProfileStore = { load: async () => ({ host: 'comfyui.test', port: 8189 }) };
  const service = createRealGenerationService({
    profileStore: hostnameProfileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
    clientFactory: ({ comfyBaseUrl }) => {
      bases.push(comfyBaseUrl);
      return {
        submitPrompt: async () => ({ prompt_id: `prompt_${bases.length}` }),
        history: async (id) => ({ [id]: { status: { status_str: 'success', completed: true }, outputs: {} } }),
      };
    },
  });
  await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(bases, ['http://192.168.10.8:8189']);
});

test('refuses generation when a reachable scan omits numeric endpoint evidence', async () => {
  const unpinnedScan = { scan: async () => ({ state: 'reachable', queue: { running: 0, pending: 0 }, candidates: [] }) };
  const service = createRealGenerationService({ profileStore, modelSelectionStore, readonlyScan: unpinnedScan });
  await assert.rejects(() => service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1 }), /GENERATION_COMFYUI_ENDPOINT_UNVERIFIED/);
});

test('reports partial_failed when a multi-round job has both failed and completed attempts', async () => {
  let submitted = 0;
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
    clientFactory: () => ({
      submitPrompt: async () => ({ prompt_id: `prompt_${++submitted}` }),
      history: async (id) => ({ [id]: id === 'prompt_1'
        ? { status: { status_str: 'error', completed: true }, outputs: {} }
        : { status: { status_str: 'success', completed: true }, outputs: {} } }),
    }),
  });
  const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  const job = await service.get(started.jobId);
  assert.equal(job.state, 'partial_failed');
  assert.equal(job.attempts.filter((attempt) => attempt.state === 'failed').length, 1);
  assert.equal(job.attempts.filter((attempt) => attempt.state === 'completed').length, 4);
});

test('reports failed when no multi-round attempt completes', async () => {
  let submitted = 0;
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
    clientFactory: () => ({
      submitPrompt: async () => ({ prompt_id: `prompt_${++submitted}` }),
      history: async (id) => ({ [id]: { status: { status_str: 'error', completed: true }, outputs: {} } }),
    }),
  });
  const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await service.get(started.jobId)).state, 'failed');
});

test('stopping during a submitted round waits for that round before blocking later submissions', async () => {
  let releaseHistory;
  const historyGate = new Promise((resolve) => { releaseHistory = resolve; });
  const submitted = [];
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
    clientFactory: () => ({
      submitPrompt: async () => { submitted.push('prompt_current'); return { prompt_id: 'prompt_current' }; },
      history: async () => historyGate,
    }),
  });
  const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  await service.stop(started.jobId);
  releaseHistory({ prompt_current: { status: { status_str: 'success', completed: true }, outputs: {} } });
  await new Promise((resolve) => setImmediate(resolve));
  const job = await service.get(started.jobId);
  assert.equal(job.state, 'stopped');
  assert.equal(job.attempts.length, 1);
  assert.equal(job.attempts[0].state, 'completed');
  assert.equal(submitted.length, 1);
});

test('stopping during VLM review of the final round preserves the completed outcome', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgx-image-final-review-stop-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+qXEAAAAASUVORK5CYII=', 'base64');
  let releaseReview;
  const reviewGate = new Promise((resolve) => { releaseReview = resolve; });
  let reviewCalls = 0;
  try {
    const service = createRealGenerationService({
      profileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
      outputRoot: path.join(root, 'generated'), libraryRoot: path.join(root, 'semifinished'),
      reviewService: { review: async () => {
        reviewCalls += 1;
        if (reviewCalls === 5) return reviewGate;
        return { state: 'completed', score: 90, pass: true, issues: [], hard_failures: [], summary: 'ok', prompt_patch: '', model: 'test-vlm' };
      } },
      clientFactory: () => ({
        submitPrompt: async (_workflow, _clientId) => ({ prompt_id: `prompt_${reviewCalls + 1}` }),
        history: async (id) => ({ [id]: { status: { status_str: 'success', completed: true }, outputs: { '8': { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] } } } }),
        view: async () => new Response(png),
      }),
    });
    const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
    for (let wait = 0; wait < 100 && reviewCalls < 5; wait += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(reviewCalls, 5);
    await service.stop(started.jobId);
    releaseReview({ state: 'completed', score: 90, pass: true, issues: [], hard_failures: [], summary: 'ok', prompt_patch: '', model: 'test-vlm' });
    let job;
    for (let wait = 0; wait < 100; wait += 1) {
      job = await service.get(started.jobId);
      if (job.state === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(job.state, 'completed');
    assert.equal(job.attempts.length, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('stopping while waiting for the next safe queue check submits no prompt', async () => {
  let releaseQueueScan;
  const queueGate = new Promise((resolve) => { releaseQueueScan = resolve; });
  let scanCalls = 0;
  let submitted = 0;
  const gatedScan = { scan: async () => {
    scanCalls += 1;
    if (scanCalls === 1) return readonlyScan.scan();
    return queueGate;
  } };
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan: gatedScan, sleepImpl: async () => {},
    clientFactory: () => ({ submitPrompt: async () => { submitted += 1; return { prompt_id: 'unexpected' }; }, history: async () => ({}) }),
  });
  const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  await new Promise((resolve) => setImmediate(resolve));
  await service.stop(started.jobId);
  releaseQueueScan({ state: 'reachable', address: '192.168.10.8', port: 8189, queue: { running: 0, pending: 0 }, candidates: [
    { candidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, directoryId: 'comfy.checkpoints' },
    { candidateId: `comfy.vae:${PONY_VAE}`, directoryId: 'comfy.vae' },
  ] });
  await new Promise((resolve) => setImmediate(resolve));
  const job = await service.get(started.jobId);
  assert.equal(job.state, 'stopped');
  assert.equal(job.attempts.length, 0);
  assert.equal(submitted, 0);
});

test('builds a real Flux Kontext graph only when its UNET, VAE and text encoders are discovered', async () => {
  const submitted = [];
  const fluxSelectionStore = { load: async () => ({ coreCandidateId: `comfy.checkpoints:${FLUX_CHECKPOINT}`, coreId: 'flux1-dev-kontext-fp8' }) };
  const fluxScan = { scan: async () => ({ state: 'reachable', address: '192.168.10.8', port: 8189, queue: { running: 0, pending: 0 }, candidates: [
    { candidateId: `comfy.checkpoints:${FLUX_CHECKPOINT}`, directoryId: 'comfy.checkpoints' },
    { candidateId: `comfy.unet:${FLUX_UNET}`, directoryId: 'comfy.unet' },
    { candidateId: `comfy.vae:${FLUX_VAE}`, directoryId: 'comfy.vae' },
    { candidateId: `comfy.text_encoders:${FLUX_CLIP_L}`, directoryId: 'comfy.text_encoders' },
    { candidateId: `comfy.text_encoders:${FLUX_T5}`, directoryId: 'comfy.text_encoders' },
    { displayName: 'Flux/style.safetensors', directoryId: 'comfy.loras.flux' },
  ] }) };
  const service = createRealGenerationService({
    profileStore, modelSelectionStore: fluxSelectionStore, readonlyScan: fluxScan,
    randomId: () => '00000000-0000-0000-0000-000000000003', sleepImpl: async () => {},
    clientFactory: () => ({
      submitPrompt: async (workflow) => { submitted.push(workflow); return { prompt_id: 'flux_prompt' }; },
      history: async () => ({ flux_prompt: { status: { status_str: 'success', completed: true }, outputs: {} } }),
    }),
  });
  await service.start({ prompt: 'a documentary portrait', width: 640, height: 640, steps: 20, guidance: 3.5, seed: 7, rounds: 5, loraName: 'Flux/style.safetensors' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitted.length, 5);
  assert.equal(submitted[0]['1'].class_type, 'UNETLoader');
  assert.equal(submitted[0]['1'].inputs.unet_name, FLUX_UNET);
  assert.equal(submitted[0]['2'].inputs.clip_name2, FLUX_T5);
  assert.equal(submitted[0]['3'].inputs.vae_name, FLUX_VAE);
  assert.equal(submitted[0]['13'].inputs.lora_name, 'Flux/style.safetensors');
});

test('does not submit Flux when a required text encoder is absent', async () => {
  const fluxSelectionStore = { load: async () => ({ coreCandidateId: `comfy.checkpoints:${FLUX_CHECKPOINT}`, coreId: 'flux1-dev-kontext-fp8' }) };
  const incompleteFluxScan = { scan: async () => ({ state: 'reachable', address: '192.168.10.8', port: 8189, queue: { running: 0, pending: 0 }, candidates: [
    { candidateId: `comfy.checkpoints:${FLUX_CHECKPOINT}`, directoryId: 'comfy.checkpoints' },
    { candidateId: `comfy.unet:${FLUX_UNET}`, directoryId: 'comfy.unet' },
    { candidateId: `comfy.vae:${FLUX_VAE}`, directoryId: 'comfy.vae' },
    { candidateId: `comfy.text_encoders:${FLUX_CLIP_L}`, directoryId: 'comfy.text_encoders' },
  ] }) };
  const service = createRealGenerationService({ profileStore, modelSelectionStore: fluxSelectionStore, readonlyScan: incompleteFluxScan });
  await assert.rejects(() => service.start({ prompt: 'a portrait', width: 640, height: 640, steps: 20, guidance: 3.5, seed: 7 }), /GENERATION_CORE_DEPENDENCIES_MISSING/);
});

test('archives each completed PNG round with its real generation parameters', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgx-image-rounds-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+qXEAAAAASUVORK5CYII=', 'base64');
  try {
    let counter = 0;
    const service = createRealGenerationService({
      profileStore, modelSelectionStore, readonlyScan, outputRoot: path.join(root, 'generated'), libraryRoot: path.join(root, 'semifinished'),
      randomId: () => '00000000-0000-0000-0000-000000000002', sleepImpl: async () => {},
      clientFactory: () => ({
        submitPrompt: async () => ({ prompt_id: `prompt_${++counter}` }),
        history: async (id) => ({ [id]: { status: { status_str: 'success', completed: true }, outputs: { '8': { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] } } } }),
        view: async () => new Response(png),
      }),
    });
    const started = await service.start({ prompt: 'an archivist', width: 640, height: 640, steps: 20, guidance: 6, seed: 7, rounds: 5 });
    let job;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      job = await service.get(started.jobId);
      if (job.state === 'completed' || job.state === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(job.state, 'completed');
    assert.ok(job.attempts.every((attempt) => attempt.outputs[0].saved === true));
    const archived = await readdir(path.join(root, 'semifinished'));
    assert.equal(archived.filter((name) => name.endsWith('.png')).length, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('attaches an actual VLM review to each archived round without blocking a completed generation on reviewer failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgx-image-review-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+qXEAAAAASUVORK5CYII=', 'base64');
  try {
    let counter = 0;
    const service = createRealGenerationService({
      profileStore, modelSelectionStore, readonlyScan, outputRoot: path.join(root, 'generated'), libraryRoot: path.join(root, 'semifinished'), sleepImpl: async () => {},
      libraryReviewStore: { set: async (libraryItemId, review) => { assert.match(libraryItemId, /_attempt_\d+\.png$/); assert.equal(review.score, 91); } },
      reviewService: { review: async ({ imagePath, requirement }) => ({ state: 'completed', score: 91, pass: true, issues: [], hard_failures: [], summary: `reviewed:${path.basename(imagePath)}:${requirement}`, prompt_patch: 'keep composition', model: 'test-vlm' }) },
      clientFactory: () => ({
        submitPrompt: async () => ({ prompt_id: `prompt_${++counter}` }),
        history: async (id) => ({ [id]: { status: { status_str: 'success', completed: true }, outputs: { '8': { images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }] } } } }),
        view: async () => new Response(png),
      }),
    });
    const started = await service.start({ prompt: 'a fox', width: 640, height: 640, steps: 20, guidance: 6, seed: 7, rounds: 5 });
    let job;
    for (let attempt = 0; attempt < 100; attempt += 1) { job = await service.get(started.jobId); if (job.state === 'completed') break; await new Promise((resolve) => setTimeout(resolve, 5)); }
    assert.equal(job.state, 'completed');
    assert.equal(job.attempts[0].review.score, 91);
    assert.equal(job.attempts[0].review.model, 'test-vlm');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('hands incomplete persisted tasks to ComfyUI history after an app restart without resubmitting them', async () => {
  let saved = [];
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan,
    jobHistoryStore: { load: async () => [{ jobId: 'job_restart1', engine: 'illustrious', coreCandidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, submittedAt: '2026-07-22T00:00:00.000Z', settings: { rounds: 5 }, state: 'generating', currentRound: 1, stopRequested: false, message: 'generating', attempts: [{ round: 1, seed: 1, promptId: 'prompt_before_restart', state: 'generating', outputs: [] }] }], save: async (jobs) => { saved = jobs; } },
  });
  assert.deepEqual(await service.recover(), { restored: 1, handedOff: 1 });
  const job = await service.get('job_restart1');
  assert.equal(job.state, 'handoff_required');
  assert.match(job.message, /ComfyUI/);
  assert.equal(saved[0].state, 'handoff_required');
});

test('evicts the oldest terminal task before publishing a 101st task', async () => {
  let saved = [];
  const persisted = Array.from({ length: 100 }, (_item, index) => ({
    jobId: `job_done${index}`, engine: 'illustrious', coreCandidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`,
    submittedAt: `2026-07-20T00:${String(index).padStart(2, '0')}:00.000Z`, settings: { rounds: 5 }, state: 'completed', currentRound: 5, stopRequested: false, message: 'done', attempts: [],
  }));
  const service = createRealGenerationService({
    profileStore, modelSelectionStore, readonlyScan, sleepImpl: async () => {},
    jobHistoryStore: { load: async () => persisted, save: async (jobs) => { saved = jobs; } },
    clientFactory: () => ({ submitPrompt: async () => ({ prompt_id: 'prompt_new' }), history: async () => ({ prompt_new: { status: { status_str: 'success', completed: true }, outputs: {} } }) }),
  });
  await service.recover();
  const started = await service.start({ prompt: 'scene', width: 640, height: 640, steps: 20, guidance: 6, seed: 1, rounds: 5 });
  assert.equal((await service.list()).length, 100);
  assert.equal((await service.get(started.jobId)).jobId, started.jobId);
  assert.equal(saved.length, 100);
  assert.equal(saved.some((job) => job.jobId === 'job_done0'), false);
});
