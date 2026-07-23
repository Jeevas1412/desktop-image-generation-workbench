import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as libraryStore from '../../backend/src/image/library-store.mjs';
import { createImageApplicationCore } from '../../backend/src/image/application-core.mjs';
import { createCoreHandlers, createDesktopImageUseCases } from '../src/backend-composition.mjs';
import { createImageDesktopAdapter } from '../src/image-desktop-adapter.mjs';
import { inspectRegisteredCore } from '../../backend/src/image/core-model-registry.mjs';
import { ILLUSTRIOUS_CHECKPOINT, PONY_VAE } from '../../backend/src/image/workflow-builders.mjs';

test('composes every desktop handler with explicit backend use cases and a managed semifinished root', async () => {
  const userDataRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-composition-'));
  try {
    const comfyUiConnectionVerifier = { verify: async (profile) => ({ service: 'comfyui', state: 'reachable', profile }) };
    let savedProfile = null;
    const comfyUiProfileStore = {
      load: async () => savedProfile,
      loadRecord: async () => savedProfile ? { ...savedProfile, verifiedAt: '2026-07-22T00:00:00.000Z' } : null,
      save: async (profile) => { savedProfile = profile; return profile; },
    };
    const reviews = {};
    const libraryReviewStore = { list: async () => reviews, set: async (libraryItemId, review) => { reviews[libraryItemId] = review; return review; } };
    const vlmConnectionVerifier = { verify: async (profile) => ({ service: 'vlm', state: 'reachable', profile }) };
    let savedVlmProfile = null;
    const vlmProfileStore = { load: async () => savedVlmProfile, save: async (profile) => { savedVlmProfile = profile; return profile; } };
    let scannedProfile = null;
    const comfyUiReadonlyScan = { scan: async (profile) => {
      scannedProfile = profile;
      return ({ service: 'comfyui', state: 'reachable', candidates: [
      { candidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}`, displayName: ILLUSTRIOUS_CHECKPOINT, directoryId: 'comfy.checkpoints' },
      { candidateId: `comfy.vae:${PONY_VAE}`, displayName: PONY_VAE, directoryId: 'comfy.vae' },
      { candidateId: 'comfy.checkpoints:_misplaced_from_loras/style.safetensors', displayName: '_misplaced_from_loras/style.safetensors', directoryId: 'comfy.checkpoints' },
      ], queue: { running: 0, pending: 0 } });
    } };
    let savedSelection = null;
    const modelSelectionStore = { load: async () => savedSelection, save: async (selection) => { savedSelection = selection; return selection; } };
    const realGenerationService = { start: async () => ({ state: 'queued' }), get: async () => ({ state: 'queued' }), stop: async () => ({ state: 'stopped' }), list: async () => [] };
    const vlmTranslationService = { translate: async (text) => ({ prompt: `translated:${text}`, model: 'test-vlm' }) };
    const vlmReviewService = { review: async () => ({ state: 'completed', score: 91, pass: true, issues: [], hard_failures: [], summary: 'reviewed' }) };
    const core = createImageApplicationCore({ useCases: createDesktopImageUseCases({ userDataRoot, libraryStore, libraryReviewStore, comfyUiConnectionVerifier, comfyUiProfileStore, comfyUiReadonlyScan, vlmConnectionVerifier, vlmProfileStore, modelSelectionStore, realGenerationService, vlmTranslationService, vlmReviewService, coreRegistry: { inspectRegisteredCore } }) });
    const adapter = createImageDesktopAdapter({ handlers: createCoreHandlers(core) });
    assert.deepEqual(await adapter.dispatch({ type: 'image:capabilities:get', payload: {} }), { status: 'unavailable', reason: 'IMAGE_BACKEND_PROFILE_NOT_CONFIGURED' });
    const source = path.join(userDataRoot, 'source.png'); await writeFile(source, 'image');
    await libraryStore.archiveImage({ sourcePath: source, libraryRoot: path.join(userDataRoot, 'semifinished'), runId: 'run-1', attemptNumber: 1 });
    const reviewed = await adapter.dispatch({ type: 'library:review', payload: { libraryItemId: 'run-1_attempt_1.png' } });
    assert.equal(reviewed.score, 91);
    assert.equal(reviews['run-1_attempt_1.png'].summary, 'reviewed');
    const plan = await adapter.dispatch({ type: 'library:semifinished:clear:plan', payload: {} });
    assert.equal(typeof plan.planId, 'string'); assert.equal(plan.itemCount, 1); assert.equal('root' in plan, false);
    assert.deepEqual(await adapter.dispatch({ type: 'library:semifinished:clear:confirm', payload: { planId: plan.planId } }), { removed: 1, totalBytes: 5 });
    assert.deepEqual(await adapter.dispatch({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8188 } } }), { service: 'comfyui', state: 'reachable', profile: { host: '192.168.1.20', port: 8188 } });
    assert.deepEqual(await adapter.dispatch({ type: 'comfyui:profile:save', payload: { profile: { host: '192.168.1.20', port: 8188 } } }), { host: '192.168.1.20', port: 8188 });
    assert.equal((await adapter.dispatch({ type: 'comfyui:status:check', payload: {} })).state, 'reachable');
    assert.deepEqual(scannedProfile, { host: '192.168.1.20', port: 8188 });
    assert.deepEqual(await adapter.dispatch({ type: 'vlm:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8003 } } }), { service: 'vlm', state: 'reachable', profile: { host: '192.168.1.20', port: 8003 } });
    assert.deepEqual(await adapter.dispatch({ type: 'vlm:profile:save', payload: { profile: { host: '192.168.1.20', port: 8003 } } }), { host: '192.168.1.20', port: 8003 });
    assert.equal((await adapter.dispatch({ type: 'comfyui:readonly:scan', payload: {} })).state, 'reachable');
    assert.equal(await adapter.dispatch({ type: 'model:selection:get', payload: {} }), null);
    assert.deepEqual(await adapter.dispatch({ type: 'prompt:translate', payload: { text: '中文提示词' } }), { prompt: 'translated:中文提示词', model: 'test-vlm' });
    const registeredSelection = await adapter.dispatch({ type: 'model:selection:save', payload: { selection: { coreCandidateId: `comfy.checkpoints:${ILLUSTRIOUS_CHECKPOINT}` } } });
    assert.equal(registeredSelection.coreId, 'illustrious-xl-v01');
    assert.equal(registeredSelection.engine, 'illustrious');
    await assert.rejects(() => adapter.dispatch({ type: 'model:selection:save', payload: { selection: { coreCandidateId: 'comfy.checkpoints:_misplaced_from_loras/style.safetensors' } } }), /MODEL_SELECTION_CORE_NOT_DISCOVERED/);
  } finally { await rm(userDataRoot, { recursive: true, force: true }); }
});

test('does not persist a ComfyUI or VLM profile that has not passed private-endpoint verification', async () => {
  const userDataRoot = await mkdtemp(path.join(os.tmpdir(), 'desktop-profile-boundary-'));
  try {
    let comfySaved = false;
    let vlmSaved = false;
    const useCases = createDesktopImageUseCases({
      userDataRoot, libraryStore,
      libraryReviewStore: { list: async () => ({}), set: async () => null },
      comfyUiConnectionVerifier: { verify: async () => ({ state: 'not_lan' }) },
      comfyUiProfileStore: { load: async () => null, save: async () => { comfySaved = true; } },
      comfyUiReadonlyScan: { scan: async () => ({ state: 'unconfigured' }) },
      vlmConnectionVerifier: { verify: async () => ({ state: 'not_lan' }) },
      vlmProfileStore: { load: async () => null, save: async () => { vlmSaved = true; } },
      modelSelectionStore: { load: async () => null, save: async () => null },
      realGenerationService: { start: async () => null, get: async () => null, stop: async () => null, list: async () => [] },
      vlmTranslationService: { translate: async () => null },
      vlmReviewService: { review: async () => ({ state: 'unavailable' }) },
      coreRegistry: { inspectRegisteredCore },
    });
    await assert.rejects(() => useCases.saveComfyUiProfile({ host: '8.8.8.8', port: 8188 }), /COMFYUI_PROFILE_VERIFICATION_NOT_LAN/);
    await assert.rejects(() => useCases.saveVlmProfile({ host: '8.8.8.8', port: 8003 }), /VLM_PROFILE_VERIFICATION_NOT_LAN/);
    assert.equal(comfySaved, false);
    assert.equal(vlmSaved, false);
  } finally { await rm(userDataRoot, { recursive: true, force: true }); }
});
