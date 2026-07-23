const REQUESTS = Object.freeze({
  'image:capabilities:get': [],
  'model:install:plan': ['capabilityId'],
  'model:install:confirm': ['planId'],
  'image:job:start': ['generation'],
  'image:job:get': ['jobId'],
  'image:job:stop': ['jobId'],
  'image:jobs:list': [],
  'prompt:translate': ['text'],
  'library:list': ['kind'],
  'library:review': ['libraryItemId'],
  'library:reference:select': ['libraryItemId'],
  'library:semifinished:clear:plan': [],
  'library:semifinished:clear:confirm': ['planId'],
  'comfyui:connection:verify': ['profile'],
  'comfyui:status:check': [],
  'comfyui:profile:get': [],
  'comfyui:profile:save': ['profile'],
  'vlm:connection:verify': ['profile'],
  'vlm:profile:get': [],
  'vlm:profile:save': ['profile'],
  'comfyui:readonly:scan': [],
  'model:selection:get': [],
  'model:selection:save': ['selection'],
});
function validDiscoveredLoraName(value) {
  return typeof value === 'string'
    && value.length <= 600
    && !/[\\\0\r\n]/.test(value)
    && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
const FORBIDDEN = /(?:url|command|token|secret|password|authorization|ssh|shell)/i;
const ID_RE = /^[A-Za-z0-9_-]+$/;

function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function validateNoForbidden(value) {
  if (!plainObject(value)) return;
  for (const [key, child] of Object.entries(value)) { if (FORBIDDEN.test(key)) throw new Error('IPC_FIELD_NOT_ALLOWED'); validateNoForbidden(child); }
}
function validateGeneration(value) {
  if (!plainObject(value)) throw new Error('IPC_GENERATION_INVALID');
  const allowed = ['prompt', 'negativePrompt', 'width', 'height', 'steps', 'guidance', 'seed', 'seedMode', 'rangeStart', 'rangeEnd', 'rounds', 'referenceId', 'referenceStrength', 'referenceMode', 'loraName', 'loraModelStrength', 'loraClipStrength', 'ponySourceTag', 'ponyRatingTag'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('IPC_GENERATION_FIELD_NOT_ALLOWED');
  if (typeof value.prompt !== 'string' || value.prompt.trim().length < 1 || value.prompt.length > 8_000 || /\0/.test(value.prompt)) throw new Error('IPC_GENERATION_PROMPT_INVALID');
  if (value.negativePrompt !== undefined && (typeof value.negativePrompt !== 'string' || value.negativePrompt.length > 8_000 || /\0/.test(value.negativePrompt))) throw new Error('IPC_GENERATION_NEGATIVE_PROMPT_INVALID');
  for (const key of ['width', 'height', 'steps', 'seed']) if (!Number.isInteger(value[key])) throw new Error('IPC_GENERATION_NUMBER_INVALID');
  for (const key of ['rangeStart', 'rangeEnd', 'rounds']) if (value[key] !== undefined && !Number.isInteger(value[key])) throw new Error('IPC_GENERATION_NUMBER_INVALID');
  for (const key of ['guidance', 'loraModelStrength', 'loraClipStrength']) if (value[key] !== undefined && !Number.isFinite(value[key])) throw new Error('IPC_GENERATION_NUMBER_INVALID');
  if (value.seedMode !== undefined && !['locked', 'increment', 'range_increment'].includes(value.seedMode)) throw new Error('IPC_GENERATION_SEED_MODE_INVALID');
  if (value.referenceId !== undefined && value.referenceId !== '' && (typeof value.referenceId !== 'string' || !/^ref_[A-Za-z0-9_-]+$/.test(value.referenceId))) throw new Error('IPC_GENERATION_REFERENCE_INVALID');
  if (value.referenceStrength !== undefined && (!Number.isFinite(value.referenceStrength) || value.referenceStrength < 0 || value.referenceStrength > 0.5)) throw new Error('IPC_GENERATION_REFERENCE_INVALID');
  if (value.referenceMode !== undefined && !['redraw', 'reference_only'].includes(value.referenceMode)) throw new Error('IPC_GENERATION_REFERENCE_INVALID');
  if (value.ponySourceTag !== undefined && !['', 'source_anime', 'source_cartoon', 'source_furry', 'source_pony'].includes(value.ponySourceTag)) throw new Error('IPC_GENERATION_PONY_TAG_INVALID');
  if (value.ponyRatingTag !== undefined && !['', 'rating_safe', 'rating_questionable', 'rating_explicit'].includes(value.ponyRatingTag)) throw new Error('IPC_GENERATION_PONY_TAG_INVALID');
  // ComfyUI exposes LoRAs in relative subfolders such as
  // "SDXL/style/example.safetensors".  The later exact scan check is the
  // authority; this layer permits only a normalized relative name.
  if (value.loraName !== undefined && value.loraName !== '' && !validDiscoveredLoraName(value.loraName)) throw new Error('IPC_GENERATION_LORA_INVALID');
}

export function validateImageIpcRequest(value) {
  if (!plainObject(value) || typeof value.type !== 'string' || !plainObject(value.payload ?? {})) throw new Error('IPC_REQUEST_INVALID');
  const allowed = REQUESTS[value.type]; if (!allowed) throw new Error('IPC_REQUEST_NOT_ALLOWED');
  const payload = value.payload ?? {}; validateNoForbidden(payload);
  if (Object.keys(payload).some((key) => !allowed.includes(key))) throw new Error('IPC_FIELD_NOT_ALLOWED');
  if (['model:install:plan', 'model:install:confirm', 'image:job:get', 'image:job:stop', 'library:semifinished:clear:confirm'].includes(value.type) && !ID_RE.test(String(payload[allowed[0]] ?? ''))) throw new Error('IPC_ID_INVALID');
  if (value.type === 'library:reference:select' && (typeof payload.libraryItemId !== 'string' || payload.libraryItemId.includes('..') || /[\\/]/.test(payload.libraryItemId))) throw new Error('IPC_LIBRARY_ITEM_ID_INVALID');
  if (['comfyui:connection:verify', 'comfyui:profile:save', 'vlm:connection:verify', 'vlm:profile:save'].includes(value.type)) {
    const profile = payload.profile;
    if (!plainObject(profile) || Object.keys(profile).some((key) => !['host', 'port'].includes(key)) || typeof profile.host !== 'string' || !Number.isInteger(profile.port)) throw new Error('IPC_COMFYUI_PROFILE_INVALID');
  }
  if (value.type === 'model:selection:save') {
    const selection = payload.selection;
    if (!plainObject(selection) || Object.keys(selection).some((key) => key !== 'coreCandidateId') || typeof selection.coreCandidateId !== 'string' || selection.coreCandidateId.length < 1 || selection.coreCandidateId.length > 600 || /[\0\r\n]/.test(selection.coreCandidateId)) throw new Error('IPC_MODEL_SELECTION_INVALID');
  }
  if (value.type === 'prompt:translate' && (typeof payload.text !== 'string' || payload.text.trim().length < 1 || payload.text.length > 8_000 || /\0/.test(payload.text))) throw new Error('IPC_TRANSLATION_TEXT_INVALID');
  if (value.type === 'image:job:start') validateGeneration(payload.generation);
  return Object.freeze({ type: value.type, payload: structuredClone(payload) });
}

export function createImageIpcDispatcher({ dispatch }) {
  if (typeof dispatch !== 'function') throw new TypeError('dispatch must be a function.');
  return Object.freeze({ request: async (value) => dispatch(validateImageIpcRequest(value)) });
}
