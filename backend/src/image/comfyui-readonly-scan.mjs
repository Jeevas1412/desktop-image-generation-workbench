import { candidatesFromComfyObjectInfo } from './fixed-model-discovery.mjs';

export function createComfyUiReadonlyScan({ verifier } = {}) {
  if (!verifier || typeof verifier.inspect !== 'function') throw new TypeError('COMFYUI_SCAN_VERIFIER_REQUIRED');
  return Object.freeze({
    async scan(profile) {
      const result = await verifier.inspect(profile);
      if (result.state !== 'reachable') return result;
      const candidates = candidatesFromComfyObjectInfo(result.objectInfo);
      return Object.freeze({ service: 'comfyui', state: 'reachable', checkedAt: new Date().toISOString(), address: result.address, port: result.port, candidates, queue: result.queue, detail: result.detail });
    },
  });
}
