import {
  FLUX_CHECKPOINT,
  FLUX_CLIP_L,
  FLUX_T5,
  FLUX_UNET,
  FLUX_VAE,
  ILLUSTRIOUS_CHECKPOINT,
  PONY_CHECKPOINT,
  PONY_VAE,
} from './workflow-builders.mjs';

function candidateId(fileName) { return `comfy.checkpoints:${fileName}`; }
function resource(directoryId, displayName) { return Object.freeze({ candidateId: `${directoryId}:${displayName}`, directoryId, displayName }); }

// The only workflows shipped by this application.  A standard remote ComfyUI
// /object_info response does not expose file hashes, so registry membership
// proves workflow compatibility, not file-integrity provenance.  The UI must
// make that distinction explicit instead of treating arbitrary checkpoints as
// verified cores.
export const REGISTERED_CORE_MODELS = Object.freeze([
  Object.freeze({
    coreId: 'pony-v6-xl', engine: 'pony', label: 'Pony Diffusion V6 XL（动画人像）',
    candidateId: candidateId(PONY_CHECKPOINT), displayName: PONY_CHECKPOINT,
    requiredResources: Object.freeze([resource('comfy.vae', PONY_VAE)]),
  }),
  Object.freeze({
    coreId: 'illustrious-xl-v01', engine: 'illustrious', label: 'Illustrious XL v0.1（动画人像）',
    candidateId: candidateId(ILLUSTRIOUS_CHECKPOINT), displayName: ILLUSTRIOUS_CHECKPOINT,
    requiredResources: Object.freeze([resource('comfy.vae', PONY_VAE)]),
  }),
  Object.freeze({
    coreId: 'flux1-dev-kontext-fp8', engine: 'flux', label: 'FLUX.1 Dev Kontext FP8（真实通用）',
    candidateId: candidateId(FLUX_CHECKPOINT), displayName: FLUX_CHECKPOINT,
    requiredResources: Object.freeze([
      resource('comfy.unet', FLUX_UNET), resource('comfy.vae', FLUX_VAE),
      resource('comfy.text_encoders', FLUX_CLIP_L), resource('comfy.text_encoders', FLUX_T5),
    ]),
  }),
]);

export function registeredCoreByCandidateId(value) {
  return REGISTERED_CORE_MODELS.find((entry) => entry.candidateId === value) ?? null;
}

export function inspectRegisteredCore(candidate, candidates = []) {
  if (!candidate || candidate.directoryId !== 'comfy.checkpoints') return null;
  const core = registeredCoreByCandidateId(candidate.candidateId);
  if (!core || (candidate.displayName !== undefined && candidate.displayName !== core.displayName)) return null;
  const found = new Set(candidates.map((item) => item?.candidateId));
  const missingResources = core.requiredResources.filter((item) => !found.has(item.candidateId));
  return Object.freeze({
    ...core,
    compatibility: missingResources.length === 0 ? 'workflow_ready' : 'dependencies_missing',
    missingResources: Object.freeze(missingResources.map((item) => item.candidateId)),
  });
}

export function supportedCoreSelection(selection) {
  if (!selection || typeof selection !== 'object') return null;
  const core = registeredCoreByCandidateId(selection.coreCandidateId);
  return core && selection.coreId === core.coreId ? core : null;
}
