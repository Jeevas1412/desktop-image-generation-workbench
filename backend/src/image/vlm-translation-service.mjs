import { validateTranslatedPrompt } from './vlm-contracts.mjs';
import { httpBaseForPrivateAddress } from './private-network.mjs';

const MAX_TEXT_LENGTH = 8_000;
const REQUEST_TIMEOUT_MS = 60_000;

function inputText(value) {
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || /\0/.test(value)) throw new Error('TRANSLATION_TEXT_INVALID');
  const text = value.trim();
  if (!text) throw new Error('TRANSLATION_TEXT_REQUIRED');
  return text;
}

async function requestJson(url, init, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response?.ok) throw new Error(`TRANSLATION_VLM_HTTP_${response?.status ?? 'FAILED'}`);
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('TRANSLATION_VLM_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

function modelId(payload) {
  const id = payload?.data?.find((item) => typeof item?.id === 'string' && item.id.length > 0)?.id;
  if (!id) throw new Error('TRANSLATION_VLM_MODEL_UNAVAILABLE');
  return id;
}

export function createVlmTranslationService({ profileStore, connectionVerifier, fetchImpl = fetch } = {}) {
  if (!profileStore || typeof profileStore.load !== 'function') throw new Error('TRANSLATION_VLM_PROFILE_STORE_REQUIRED');
  if (!connectionVerifier || typeof connectionVerifier.inspect !== 'function') throw new Error('TRANSLATION_VLM_CONNECTION_VERIFIER_REQUIRED');
  if (typeof fetchImpl !== 'function') throw new Error('TRANSLATION_FETCH_REQUIRED');
  return Object.freeze({
    async translate(text) {
      const source = inputText(text);
      const profile = await profileStore.load();
      if (!profile) throw new Error('TRANSLATION_VLM_PROFILE_REQUIRED');
      // Resolve and verify the VLM endpoint on every request.  Requests use
      // the verifier's numeric private address, preventing DNS rebinding
      // between validation and model/chat calls.
      const verified = await connectionVerifier.inspect(profile);
      if (verified.state !== 'reachable' || typeof verified.address !== 'string' || !Number.isInteger(verified.port)) throw new Error(`TRANSLATION_VLM_${String(verified.state ?? 'UNAVAILABLE').toUpperCase()}`);
      const base = new URL(httpBaseForPrivateAddress(verified.address, verified.port, '/v1/'));
      const model = modelId(verified.models);
      const body = {
        model,
        // Qwen3-VL is more deterministic for text-only prompt translation at
        // zero temperature.  A generic "prompt tags" instruction made it
        // occasionally produce unrelated stylistic tags instead of a
        // translation, so keep the task deliberately narrow and explicit.
        temperature: 0,
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content: 'You are an exact Chinese-to-English translator for image-generation prompts. Translate only the user text. Preserve every requested subject, action, framing, composition, camera, lighting, color, style, and existing English trigger words. Do not invent unrelated details. Do not add policy, safety, commercial, copyright, or brand commentary. Return JSON only: {"prompt":"..."}.',
          },
          { role: 'user', content: source },
        ],
      };
      const response = await requestJson(new URL('chat/completions', base), { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) }, fetchImpl);
      const content = response?.choices?.[0]?.message?.content;
      const prompt = validateTranslatedPrompt(content);
      return Object.freeze({ prompt, model });
    },
  });
}
