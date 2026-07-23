import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildReviewInstruction, normalizeReview } from './vlm-contracts.mjs';
import { httpBaseForPrivateAddress } from './private-network.mjs';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const MIME_BY_EXTENSION = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' });

function modelId(payload) {
  const id = payload?.data?.find((item) => typeof item?.id === 'string' && item.id.length > 0)?.id;
  if (!id) throw new Error('VLM_REVIEW_MODEL_UNAVAILABLE');
  return id;
}

function unavailable(detail) { return Object.freeze({ state: 'unavailable', detail }); }
function failed(error) {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'VLM_REVIEW_FAILED';
  return Object.freeze({ state: 'failed', detail: `VLM 审核未完成：${code}` });
}

async function boundedJson(response) {
  if (!response?.body || typeof response.body.getReader !== 'function') throw new Error('VLM_REVIEW_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = Buffer.from(value);
      total += bytes.length;
      if (total > MAX_RESPONSE_BYTES) throw new Error('VLM_REVIEW_RESPONSE_TOO_LARGE');
      chunks.push(bytes);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, total).toString('utf8')); } catch { throw new Error('VLM_REVIEW_RESPONSE_INVALID'); }
}

async function requestJson(url, init, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response?.ok) throw new Error(`VLM_REVIEW_HTTP_${response?.status ?? 'FAILED'}`);
    return boundedJson(response);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('VLM_REVIEW_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

async function imageDataUrl(imagePath, { lstatImpl = lstat, readFileImpl = readFile } = {}) {
  if (typeof imagePath !== 'string' || !path.isAbsolute(imagePath)) throw new Error('VLM_REVIEW_IMAGE_PATH_INVALID');
  const extension = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new Error('VLM_REVIEW_IMAGE_TYPE_INVALID');
  const info = await lstatImpl(imagePath).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > MAX_IMAGE_BYTES) throw new Error('VLM_REVIEW_IMAGE_SIZE_INVALID');
  const bytes = await readFileImpl(imagePath);
  if (bytes.length !== info.size || bytes.length > MAX_IMAGE_BYTES) throw new Error('VLM_REVIEW_IMAGE_SIZE_INVALID');
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

export function createVlmReviewService({ profileStore, connectionVerifier, fetchImpl = fetch, lstatImpl = lstat, readFileImpl = readFile } = {}) {
  if (!profileStore || typeof profileStore.load !== 'function') throw new Error('VLM_REVIEW_PROFILE_STORE_REQUIRED');
  if (!connectionVerifier || typeof connectionVerifier.inspect !== 'function') throw new Error('VLM_REVIEW_CONNECTION_VERIFIER_REQUIRED');
  if (typeof fetchImpl !== 'function' || typeof lstatImpl !== 'function' || typeof readFileImpl !== 'function') throw new Error('VLM_REVIEW_DEPENDENCIES_REQUIRED');
  return Object.freeze({
    async review({ imagePath, requirement, referenceWeight = 0, hasReference = false, threshold = 80 } = {}) {
      const profile = await profileStore.load();
      if (!profile) return unavailable('VLM 审核未运行：尚未在“连接 ComfyUI”页面配置并验证 VLM 服务。');
      let verified;
      try { verified = await connectionVerifier.inspect(profile); } catch { return unavailable('VLM 审核未运行：无法验证已保存的 VLM 服务。'); }
      if (verified.state !== 'reachable' || typeof verified.address !== 'string' || !Number.isInteger(verified.port)) {
        return unavailable(`VLM 审核未运行：${verified.detail ?? 'VLM 当前不可达。'}`);
      }
      try {
        const model = modelId(verified.models);
        const imageUrl = await imageDataUrl(imagePath, { lstatImpl, readFileImpl });
        const base = new URL(httpBaseForPrivateAddress(verified.address, verified.port, '/v1/'));
        const body = {
          model,
          temperature: 0,
          max_tokens: 900,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: buildReviewInstruction({ requirement, referenceWeight, hasReference, threshold }) },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          }],
        };
        const response = await requestJson(new URL('chat/completions', base), { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }, fetchImpl);
        const review = normalizeReview(response?.choices?.[0]?.message?.content, { requirement, threshold });
        return Object.freeze({ state: 'completed', model, ...review });
      } catch (error) { return failed(error); }
    },
  });
}
