import { FIXED_DISCOVERY_ENDPOINTS } from './fixed-model-discovery.mjs';

const FIXED_ROUTES = Object.freeze({
  [FIXED_DISCOVERY_ENDPOINTS.comfyObjectInfo]: 'comfy',
  [FIXED_DISCOVERY_ENDPOINTS.vlmModels]: 'vlm',
});

function normalizedBaseUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be configured.`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError(`${label} must use http or https.`);
  return url;
}

export function createFixedReadonlyRequest({ comfyBaseUrl, vlmBaseUrl, fetchImpl = fetch }) {
  const bases = Object.freeze({
    comfy: normalizedBaseUrl(comfyBaseUrl, 'comfyBaseUrl'),
    vlm: normalizedBaseUrl(vlmBaseUrl, 'vlmBaseUrl'),
  });
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  return async ({ method, endpoint }) => {
    if (method !== 'GET') throw new Error('Fixed model discovery allows GET only.');
    const target = FIXED_ROUTES[endpoint];
    if (!target) throw new Error('Fixed model discovery endpoint is not allowed.');
    const url = new URL(endpoint, bases[target]);
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    if (!response || !response.ok) throw new Error(`Fixed model discovery request failed: ${endpoint}.`);
    return response.json();
  };
}
