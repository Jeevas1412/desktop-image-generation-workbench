import path from 'node:path';

function unavailable(operation) {
  return async () => { throw new Error(`IMAGE_BACKEND_PROFILE_NOT_CONFIGURED:${operation}`); };
}

function isMisplacedLoraCandidate(candidate) {
  return candidate?.directoryId === 'comfy.checkpoints'
    && typeof candidate.displayName === 'string'
    && candidate.displayName.replaceAll('\\', '/').startsWith('_misplaced_from_loras/');
}

export function createDesktopImageUseCases({ userDataRoot, libraryStore, libraryReviewStore, comfyUiConnectionVerifier, comfyUiProfileStore, comfyUiReadonlyScan, vlmConnectionVerifier, vlmProfileStore, modelSelectionStore, realGenerationService, vlmTranslationService, vlmReviewService, coreRegistry } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('DESKTOP_USER_DATA_ROOT_REQUIRED');
  if (!libraryStore || typeof libraryStore.createSemifinishedCleanupService !== 'function') throw new Error('DESKTOP_LIBRARY_STORE_REQUIRED');
  if (!libraryReviewStore || typeof libraryReviewStore.list !== 'function' || typeof libraryReviewStore.set !== 'function') throw new Error('DESKTOP_LIBRARY_REVIEW_STORE_REQUIRED');
  if (!comfyUiConnectionVerifier || typeof comfyUiConnectionVerifier.verify !== 'function') throw new Error('DESKTOP_COMFYUI_CONNECTION_VERIFIER_REQUIRED');
  if (!comfyUiProfileStore || typeof comfyUiProfileStore.load !== 'function' || typeof comfyUiProfileStore.save !== 'function') throw new Error('DESKTOP_COMFYUI_PROFILE_STORE_REQUIRED');
  if (!comfyUiReadonlyScan || typeof comfyUiReadonlyScan.scan !== 'function') throw new Error('DESKTOP_COMFYUI_SCAN_REQUIRED');
  if (!vlmConnectionVerifier || typeof vlmConnectionVerifier.verify !== 'function') throw new Error('DESKTOP_VLM_CONNECTION_VERIFIER_REQUIRED');
  if (!vlmProfileStore || typeof vlmProfileStore.load !== 'function' || typeof vlmProfileStore.save !== 'function') throw new Error('DESKTOP_VLM_PROFILE_STORE_REQUIRED');
  if (!modelSelectionStore || typeof modelSelectionStore.load !== 'function' || typeof modelSelectionStore.save !== 'function') throw new Error('DESKTOP_MODEL_SELECTION_STORE_REQUIRED');
  if (!realGenerationService || typeof realGenerationService.start !== 'function' || typeof realGenerationService.get !== 'function' || typeof realGenerationService.stop !== 'function' || typeof realGenerationService.list !== 'function') throw new Error('DESKTOP_REAL_GENERATION_SERVICE_REQUIRED');
  if (!vlmTranslationService || typeof vlmTranslationService.translate !== 'function') throw new Error('DESKTOP_VLM_TRANSLATION_SERVICE_REQUIRED');
  if (!vlmReviewService || typeof vlmReviewService.review !== 'function') throw new Error('DESKTOP_VLM_REVIEW_SERVICE_REQUIRED');
  if (!coreRegistry || typeof coreRegistry.inspectRegisteredCore !== 'function') throw new Error('DESKTOP_CORE_REGISTRY_REQUIRED');
  const libraryRoot = path.join(userDataRoot, 'semifinished');
  const cleanup = libraryStore.createSemifinishedCleanupService({
    onRemoved: typeof libraryReviewStore.removeMany === 'function'
      ? (libraryItemIds) => libraryReviewStore.removeMany(libraryItemIds)
      : null,
  });
  async function profileRecord() {
    if (typeof comfyUiProfileStore.loadRecord === 'function') return comfyUiProfileStore.loadRecord();
    const profile = await comfyUiProfileStore.load();
    return profile ? Object.freeze({ ...profile, verifiedAt: null }) : null;
  }
  return Object.freeze({
    capabilities: async () => {
      const profile = await profileRecord();
      if (!profile) return Object.freeze({ status: 'unavailable', reason: 'IMAGE_BACKEND_PROFILE_NOT_CONFIGURED' });
      const stale = !profile.verifiedAt || Date.now() - Date.parse(profile.verifiedAt) > 15 * 60 * 1000;
      return Object.freeze({ status: stale ? 'stale' : 'saved', reason: stale ? 'COMFYUI_PROFILE_STALE' : 'COMFYUI_PROFILE_SAVED', profile, verifiedAt: profile.verifiedAt });
    },
    planInstall: unavailable('model:install:plan'),
    confirmInstall: unavailable('model:install:confirm'),
    startJob: async (generation) => realGenerationService.start(generation),
    getJob: async (jobId) => realGenerationService.get(jobId),
    stopJob: async (jobId) => realGenerationService.stop(jobId),
    listJobs: async () => realGenerationService.list(),
    translatePrompt: async (text) => vlmTranslationService.translate(text),
    listLibrary: async (kind) => {
      if (kind !== 'semifinished') throw new Error('DESKTOP_LIBRARY_KIND_NOT_ALLOWED');
      const [items, reviews] = await Promise.all([libraryStore.listLibrary(libraryRoot), libraryReviewStore.list()]);
      return items.map((item) => Object.freeze({ ...item, ...(reviews[item.libraryItemId] ? { review: reviews[item.libraryItemId] } : {}) }));
    },
    reviewLibraryItem: async (libraryItemId) => {
      const imagePath = await libraryStore.selectReference({ libraryRoot, libraryItemId });
      const jobs = await realGenerationService.list();
      const owner = jobs.find((job) => job?.attempts?.some((attempt) => attempt?.outputs?.some((output) => output?.libraryItemId === libraryItemId)));
      const review = await vlmReviewService.review({
        imagePath,
        requirement: typeof owner?.settings?.prompt === 'string' && owner.settings.prompt.trim()
          ? owner.settings.prompt
          : 'Inspect composition, clarity, image quality, and artifacts. No original generation prompt is available for this archived image.',
        referenceWeight: owner?.settings?.referenceStrength ?? 0,
        hasReference: Boolean(owner?.settings?.referenceId),
      });
      return libraryReviewStore.set(libraryItemId, review);
    },
    selectReference: async (libraryItemId) => libraryStore.selectReference({ libraryRoot, libraryItemId }),
    createSemifinishedCleanupPlan: async () => {
      const plan = await cleanup.createPlan({ libraryRoot });
      return Object.freeze({ planId: plan.planId, itemCount: plan.files.length, totalBytes: plan.files.reduce((total, item) => total + item.size, 0), expiresAt: plan.expiresAt });
    },
    confirmSemifinishedCleanup: async (planId) => cleanup.confirm({ libraryRoot, planId }),
    verifyComfyUiConnection: async (profile) => comfyUiConnectionVerifier.verify(profile),
    checkComfyUiStatus: async () => {
      const profile = await profileRecord();
      const checkedAt = new Date().toISOString();
      if (!profile) return Object.freeze({ service: 'comfyui', state: 'unconfigured', detail: '尚未保存 ComfyUI 连接配置。', checkedAt, profile: null });
      // Use the exact read-only probe used by generation preflight.  A header
      // must never report a different reachability state from a task that has
      // just passed the same ComfyUI probe and begun generating.
      // The persisted record also carries verifiedAt for UI provenance, but
      // private-network validation intentionally accepts only host and port.
      // Passing the entire record throws before the read-only probe and made
      // the header falsely render "currently unreachable" while generation
      // (which uses profileStore.load()) still worked.
      const result = await comfyUiReadonlyScan.scan({ host: profile.host, port: profile.port });
      return Object.freeze({ ...result, checkedAt, verifiedAt: profile.verifiedAt, profile: Object.freeze({ host: profile.host, port: profile.port }) });
    },
    getComfyUiProfile: async () => profileRecord(),
    saveComfyUiProfile: async (profile) => {
      const verified = await comfyUiConnectionVerifier.verify(profile);
      if (verified.state !== 'reachable') throw new Error(`COMFYUI_PROFILE_VERIFICATION_${String(verified.state ?? 'FAILED').toUpperCase()}`);
      return comfyUiProfileStore.save(profile);
    },
    verifyVlmConnection: async (profile) => vlmConnectionVerifier.verify(profile),
    getVlmProfile: async () => vlmProfileStore.load(),
    saveVlmProfile: async (profile) => {
      const verified = await vlmConnectionVerifier.verify(profile);
      if (verified.state !== 'reachable') throw new Error(`VLM_PROFILE_VERIFICATION_${String(verified.state ?? 'FAILED').toUpperCase()}`);
      return vlmProfileStore.save(profile);
    },
    scanComfyUiReadonly: async () => { const profile = await comfyUiProfileStore.load(); if (!profile) return Object.freeze({ service: 'comfyui', state: 'unconfigured', candidates: [], queue: { running: 0, pending: 0 } }); return comfyUiReadonlyScan.scan(profile); },
    getModelSelection: async () => modelSelectionStore.load(),
    saveModelSelection: async (selection) => {
      const profile = await comfyUiProfileStore.load();
      if (!profile) throw new Error('MODEL_SELECTION_COMFYUI_PROFILE_REQUIRED');
      const scan = await comfyUiReadonlyScan.scan(profile);
      if (scan.state !== 'reachable') throw new Error('MODEL_SELECTION_COMFYUI_SCAN_REQUIRED');
      const candidate = scan.candidates.find((item) => item.candidateId === selection?.coreCandidateId && item.directoryId === 'comfy.checkpoints' && !isMisplacedLoraCandidate(item));
      if (!candidate) throw new Error('MODEL_SELECTION_CORE_NOT_DISCOVERED');
      const inspected = coreRegistry.inspectRegisteredCore(candidate, scan.candidates);
      if (!inspected) throw new Error('MODEL_SELECTION_CORE_NOT_REGISTERED');
      if (inspected.compatibility !== 'workflow_ready') throw new Error('MODEL_SELECTION_CORE_DEPENDENCIES_MISSING');
      const saved = await modelSelectionStore.save({
        coreCandidateId: candidate.candidateId,
        coreId: inspected.coreId,
        verifiedAt: new Date().toISOString(),
        verification: { source: 'comfy-object-info', compatibility: 'workflow_ready', missingResources: [] },
      });
      return Object.freeze({ ...saved, displayName: inspected.label, directoryId: candidate.directoryId, engine: inspected.engine, integrity: 'not_available_from_comfyui_api' });
    },
  });
}

export function createCoreHandlers(core, { referenceHandles = null } = {}) {
  if (!core || typeof core.dispatch !== 'function') throw new TypeError('DESKTOP_APPLICATION_CORE_REQUIRED');
  return Object.freeze({
    capabilities: () => core.dispatch({ type: 'image:capabilities:get', payload: {} }),
    planInstall: (capabilityId) => core.dispatch({ type: 'model:install:plan', payload: { capabilityId } }),
    confirmInstall: (planId) => core.dispatch({ type: 'model:install:confirm', payload: { planId } }),
    startJob: (generation) => core.dispatch({ type: 'image:job:start', payload: { generation } }),
    getJob: (jobId) => core.dispatch({ type: 'image:job:get', payload: { jobId } }),
    stopJob: (jobId) => core.dispatch({ type: 'image:job:stop', payload: { jobId } }),
    listJobs: () => core.dispatch({ type: 'image:jobs:list', payload: {} }),
    translatePrompt: (text) => core.dispatch({ type: 'prompt:translate', payload: { text } }),
    listLibrary: (kind) => core.dispatch({ type: 'library:list', payload: { kind } }),
    reviewLibraryItem: (libraryItemId) => core.dispatch({ type: 'library:review', payload: { libraryItemId } }),
    selectReference: async (libraryItemId) => {
      const filePath = await core.dispatch({ type: 'library:reference:select', payload: { libraryItemId } });
      if (!referenceHandles) return filePath;
      return referenceHandles.register(filePath);
    },
    createSemifinishedCleanupPlan: () => core.dispatch({ type: 'library:semifinished:clear:plan', payload: {} }),
    confirmSemifinishedCleanup: (planId) => core.dispatch({ type: 'library:semifinished:clear:confirm', payload: { planId } }),
    verifyComfyUiConnection: (profile) => core.dispatch({ type: 'comfyui:connection:verify', payload: { profile } }),
    checkComfyUiStatus: () => core.dispatch({ type: 'comfyui:status:check', payload: {} }),
    getComfyUiProfile: () => core.dispatch({ type: 'comfyui:profile:get', payload: {} }),
    saveComfyUiProfile: (profile) => core.dispatch({ type: 'comfyui:profile:save', payload: { profile } }),
    verifyVlmConnection: (profile) => core.dispatch({ type: 'vlm:connection:verify', payload: { profile } }),
    getVlmProfile: () => core.dispatch({ type: 'vlm:profile:get', payload: {} }),
    saveVlmProfile: (profile) => core.dispatch({ type: 'vlm:profile:save', payload: { profile } }),
    scanComfyUiReadonly: () => core.dispatch({ type: 'comfyui:readonly:scan', payload: {} }),
    getModelSelection: () => core.dispatch({ type: 'model:selection:get', payload: {} }),
    saveModelSelection: (selection) => core.dispatch({ type: 'model:selection:save', payload: { selection } }),
  });
}
