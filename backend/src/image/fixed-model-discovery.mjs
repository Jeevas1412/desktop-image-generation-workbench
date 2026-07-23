// C-12.3: this module deliberately discovers names only from fixed API fields.
// It never accepts a filesystem path, command, URL, or model name from a renderer.

export const FIXED_DISCOVERY_ENDPOINTS = Object.freeze({
  comfyObjectInfo: '/object_info',
  vlmModels: '/v1/models',
});

const COMFY_FIELDS = Object.freeze([
  Object.freeze({ node: 'CheckpointLoaderSimple', field: 'ckpt_name', directoryId: 'comfy.checkpoints' }),
  Object.freeze({ node: 'UNETLoader', field: 'unet_name', directoryId: 'comfy.unet' }),
  Object.freeze({ node: 'VAELoader', field: 'vae_name', directoryId: 'comfy.vae' }),
  Object.freeze({ node: 'DualCLIPLoader', field: 'clip_name1', directoryId: 'comfy.text_encoders' }),
  Object.freeze({ node: 'DualCLIPLoader', field: 'clip_name2', directoryId: 'comfy.text_encoders' }),
  Object.freeze({ node: 'LoraLoader', field: 'lora_name', directoryId: 'comfy.loras' }),
]);

function valuesForField(objectInfo, node, field) {
  const value = objectInfo?.[node]?.input?.required?.[field];
  const options = Array.isArray(value) ? value[0] : null;
  return Array.isArray(options) ? options.filter((item) => typeof item === 'string' && item.length > 0) : [];
}

function loraDirectory(fileName) {
  const normalized = fileName.replaceAll('\\', '/');
  if (normalized.startsWith('SDXL/')) return 'comfy.loras.sdxl';
  if (normalized.startsWith('Flux/')) return 'comfy.loras.flux';
  return 'comfy.loras';
}

function candidate(directoryId, fileName) {
  return Object.freeze({
    candidateId: `${directoryId}:${fileName}`,
    displayName: fileName,
    directoryId,
    source: 'comfy-object-info',
  });
}

export function candidatesFromComfyObjectInfo(objectInfo) {
  if (!objectInfo || typeof objectInfo !== 'object' || Array.isArray(objectInfo)) {
    throw new Error('ComfyUI object_info must be an object.');
  }
  const found = new Map();
  for (const descriptor of COMFY_FIELDS) {
    for (const fileName of valuesForField(objectInfo, descriptor.node, descriptor.field)) {
      const directoryId = descriptor.node === 'LoraLoader' ? loraDirectory(fileName) : descriptor.directoryId;
      const value = candidate(directoryId, fileName);
      found.set(value.candidateId, value);
    }
  }
  return Object.freeze([...found.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
}

export function candidatesFromVlmModels(payload) {
  const models = payload?.data;
  if (!Array.isArray(models)) {
    throw new Error('VLM /models response must contain a data array.');
  }
  const found = new Map();
  for (const model of models) {
    if (!model || typeof model.id !== 'string' || model.id.length === 0) continue;
    const value = Object.freeze({
      candidateId: `vlm.registry:${model.id}`,
      displayName: model.id,
      directoryId: 'vlm.registry',
      source: 'vlm-models',
    });
    found.set(value.candidateId, value);
  }
  return Object.freeze([...found.values()].sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
}

export function unavailableModelDiscovery(checkedAt = new Date().toISOString()) {
  return Object.freeze({
    schemaVersion: 1,
    checkedAt,
    status: 'unknown',
    candidates: Object.freeze([]),
    blockingReasons: Object.freeze(['DISCOVERY_NOT_CONFIGURED']),
  });
}

export function createFixedModelDiscovery({ requestJson, now = () => new Date() }) {
  if (typeof requestJson !== 'function') throw new TypeError('requestJson must be a function.');
  return async () => {
    const [objectInfo, vlmModels] = await Promise.all([
      requestJson({ method: 'GET', endpoint: FIXED_DISCOVERY_ENDPOINTS.comfyObjectInfo }),
      requestJson({ method: 'GET', endpoint: FIXED_DISCOVERY_ENDPOINTS.vlmModels }),
    ]);
    const candidates = Object.freeze([
      ...candidatesFromComfyObjectInfo(objectInfo),
      ...candidatesFromVlmModels(vlmModels),
    ].sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
    return Object.freeze({
      schemaVersion: 1,
      checkedAt: now().toISOString(),
      status: candidates.length > 0 ? 'scanned' : 'missing',
      candidates,
      blockingReasons: Object.freeze([]),
    });
  };
}
