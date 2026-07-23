function baseUrl(value) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError('comfyBaseUrl must be configured.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('comfyBaseUrl must use http or https.');
  return url;
}

function safeSegment(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${label}_NOT_ALLOWED`);
  return value;
}

function safeFileName(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('..') || /[\\/]/.test(value)) throw new Error('FILE_NAME_NOT_ALLOWED');
  return value;
}

export function createComfyClient({ comfyBaseUrl, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const base = baseUrl(comfyBaseUrl);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive integer.');

  async function request(pathname, init = {}) {
    const controller = new AbortController();
    let timer;
    try {
      const response = await Promise.race([
        fetchImpl(new URL(pathname, base), { ...init, signal: controller.signal }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('COMFY_TIMEOUT')); }, timeoutMs); }),
      ]);
      if (!response?.ok) throw new Error(`COMFY_HTTP_${response?.status ?? 'FAILED'}`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    async queue() { return (await request('/queue')).json(); },
    async submitPrompt(workflow, clientId) {
      if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) throw new Error('WORKFLOW_INVALID');
      const safeClientId = safeSegment(clientId, 'CLIENT_ID');
      return (await request('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: workflow, client_id: safeClientId }) })).json();
    },
    async history(promptId) {
      return (await request(`/history/${safeSegment(promptId, 'PROMPT_ID')}`)).json();
    },
    async view({ filename, subfolder = '', type = 'output' }) {
      const safeType = ['output', 'temp'].includes(type) ? type : (() => { throw new Error('VIEW_TYPE_NOT_ALLOWED'); })();
      if (typeof subfolder !== 'string' || subfolder.includes('..') || subfolder.includes('\\')) throw new Error('SUBFOLDER_NOT_ALLOWED');
      const query = new URLSearchParams({ filename: safeFileName(filename), subfolder, type: safeType });
      return request(`/view?${query.toString()}`);
    },
    async uploadImage({ fileName, blob, overwrite = false }) {
      const safeName = safeFileName(fileName);
      if (!(blob instanceof Blob)) throw new Error('UPLOAD_BLOB_INVALID');
      const body = new FormData();
      body.append('image', blob, safeName);
      body.append('overwrite', String(overwrite === true));
      return (await request('/upload/image', { method: 'POST', body })).json();
    },
    async interrupt() { return (await request('/interrupt', { method: 'POST' })).json(); },
  });
}
