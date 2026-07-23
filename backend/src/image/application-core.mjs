const HANDLERS = Object.freeze({
  'image:capabilities:get': ['capabilities', () => undefined],
  'model:install:plan': ['planInstall', (payload) => payload.capabilityId],
  'model:install:confirm': ['confirmInstall', (payload) => payload.planId],
  'image:job:start': ['startJob', (payload) => payload.generation],
  'image:job:get': ['getJob', (payload) => payload.jobId],
  'image:job:stop': ['stopJob', (payload) => payload.jobId],
  'image:jobs:list': ['listJobs', () => undefined],
  'prompt:translate': ['translatePrompt', (payload) => payload.text],
  'library:list': ['listLibrary', (payload) => payload.kind],
  'library:review': ['reviewLibraryItem', (payload) => payload.libraryItemId],
  'library:reference:select': ['selectReference', (payload) => payload.libraryItemId],
  'library:semifinished:clear:plan': ['createSemifinishedCleanupPlan', () => undefined],
  'library:semifinished:clear:confirm': ['confirmSemifinishedCleanup', (payload) => payload.planId],
  'comfyui:connection:verify': ['verifyComfyUiConnection', (payload) => payload.profile],
  'comfyui:status:check': ['checkComfyUiStatus', () => undefined],
  'comfyui:profile:get': ['getComfyUiProfile', () => undefined],
  'comfyui:profile:save': ['saveComfyUiProfile', (payload) => payload.profile],
  'vlm:connection:verify': ['verifyVlmConnection', (payload) => payload.profile],
  'vlm:profile:get': ['getVlmProfile', () => undefined],
  'vlm:profile:save': ['saveVlmProfile', (payload) => payload.profile],
  'comfyui:readonly:scan': ['scanComfyUiReadonly', () => undefined],
  'model:selection:get': ['getModelSelection', () => undefined],
  'model:selection:save': ['saveModelSelection', (payload) => payload.selection],
});

export function createImageApplicationCore({ useCases = {} } = {}) {
  return Object.freeze({
    async dispatch(request) {
      const target = HANDLERS[request?.type];
      if (!target) throw new Error('IMAGE_CORE_REQUEST_NOT_ALLOWED');
      const [name, argument] = target; const useCase = useCases[name];
      if (typeof useCase !== 'function') throw new Error('IMAGE_CORE_USE_CASE_UNAVAILABLE');
      return useCase(argument(request.payload ?? {}));
    },
  });
}
