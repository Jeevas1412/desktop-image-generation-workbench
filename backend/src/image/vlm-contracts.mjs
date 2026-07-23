const HAN_RE = /[\u3400-\u9fff]/;
const ANATOMY_RE = /anatom|\bhands?\b|finger|human body|body structure|人体|手部|手指|肢体|四肢|脚趾|腿部|手臂|胳膊/i;
const REFERENCE_TYPES = new Set(['human_character', 'object', 'animal', 'scene_environment', 'abstract_style']);
const MAX_REVIEW_ITEMS = 20;
const MAX_REVIEW_ITEM_LENGTH = 500;
const MAX_REVIEW_TEXT_LENGTH = 2_000;

function boundedReviewText(value, code) {
  const text = String(value ?? '').trim();
  if (text.length > MAX_REVIEW_TEXT_LENGTH) throw new Error(code);
  return text;
}
function boundedReviewItems(value, code) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_REVIEW_ITEMS) throw new Error(code);
  return value.map((item) => {
    const text = String(item ?? '').trim();
    if (text.length > MAX_REVIEW_ITEM_LENGTH) throw new Error(code);
    return text;
  });
}

export function parseVlmJson(value) {
  const text = String(value ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('VLM_JSON_INVALID');
    try { return JSON.parse(match[0]); } catch { throw new Error('VLM_JSON_INVALID'); }
  }
}

export function containsChinese(value) { return HAN_RE.test(String(value ?? '')); }

export function humanAnatomyApplicable(requirement) {
  const text = String(requirement ?? '').toLowerCase();
  if (/\b(?:no|without)\s+(?:people|persons?|humans?|characters?)\b|无人|没有人物|不含人物|无人物|空无一人/.test(text)) return false;
  return /\b(?:person|people|human|humanoid|anthropomorphic|man|woman|boy|girl|male|female|adult|child|character|model|1girl|1boy|furry|hands?|fingers?|full[- ]?body|upper[- ]?body|portrait)\b|人物|人体|人像|人类|男人|女人|男孩|女孩|男性|女性|少女|少年|成人|模特|角色|拟人|兽人|手指|双手|手部|全身|半身|面部|脸部/.test(text);
}

function withoutAnatomy(items) { return items.filter((item) => !ANATOMY_RE.test(String(item))); }

export function normalizeReview(value, { requirement = '', threshold = 80 } = {}) {
  const raw = typeof value === 'string' ? parseVlmJson(value) : (value ?? {});
  const anatomyApplies = humanAnatomyApplicable(requirement);
  const result = {
    score: Math.max(0, Math.min(100, Math.trunc(Number(raw.score) || 0))),
    hard_failures: boundedReviewItems(raw.hard_failures, 'VLM_REVIEW_OUTPUT_TOO_LARGE'),
    issues: boundedReviewItems(raw.issues, 'VLM_REVIEW_OUTPUT_TOO_LARGE'),
    prompt_patch: boundedReviewText(raw.prompt_patch, 'VLM_REVIEW_OUTPUT_TOO_LARGE'),
    summary: boundedReviewText(raw.summary, 'VLM_REVIEW_OUTPUT_TOO_LARGE'),
  };
  if (!anatomyApplies) {
    result.hard_failures = withoutAnatomy(result.hard_failures);
    result.issues = withoutAnatomy(result.issues);
    result.prompt_patch = result.prompt_patch.split(',').map((part) => part.trim()).filter((part) => part && !ANATOMY_RE.test(part)).join(', ');
    if (ANATOMY_RE.test(result.summary)) result.summary = '已按非人物任务审核提示词一致性、构图、画质与伪影。';
  }
  result.pass = result.score >= threshold && result.hard_failures.length === 0;
  return result;
}

export function buildTranslationInstruction({ prompt, engine = 'flux' } = {}) {
  const target = engine === 'pony'
    ? 'Pony Diffusion V6 XL. Prefer concise comma-separated English visual tags, while keeping any necessary natural-language relation or action phrases'
    : engine === 'illustrious_lowres'
      ? 'Illustrious XL. Prefer concise Danbooru-style comma-separated English tags, while preserving complex actions and spatial relations in natural English'
      : 'FLUX';
  return `Translate the following image-generation prompt into precise English for ${target}.\nPreserve every subject, action, composition, camera, lighting, material, color, style, and negative requirement.\nDo not add safety, commercial, copyright, or brand commentary. Preserve existing English LoRA trigger words exactly.\nReturn JSON only with one non-empty key named prompt.\nSource prompt:\n${String(prompt ?? '').trim()}`;
}

export function validateTranslatedPrompt(value) {
  const prompt = String(typeof value === 'string' ? parseVlmJson(value).prompt : value?.prompt ?? '').trim();
  if (!prompt) throw new Error('VLM_TRANSLATION_EMPTY');
  if (containsChinese(prompt)) throw new Error('VLM_TRANSLATION_CONTAINS_CHINESE');
  return prompt;
}

export function normalizeReferenceDescriptor(value) {
  const raw = typeof value === 'string' ? parseVlmJson(value) : (value ?? {});
  const subjectType = String(raw.subject_type ?? '').trim();
  const descriptor = String(raw.descriptor ?? '').trim();
  if (!descriptor) throw new Error('VLM_REFERENCE_DESCRIPTOR_EMPTY');
  if (containsChinese(descriptor)) throw new Error('VLM_REFERENCE_DESCRIPTOR_CONTAINS_CHINESE');
  return { subject_type: REFERENCE_TYPES.has(subjectType) ? subjectType : 'abstract_style', descriptor };
}

export function buildReferenceInstruction() {
  return 'Analyze this reference image for a new image-generation task. Classify it as exactly one of: human_character, object, animal, scene_environment, abstract_style. Return a concise English descriptor of stable visible traits appropriate to that type. Do not assume a person is present or invent face, hands, clothing, or anatomy for non-person references. The user generation prompt remains primary; this descriptor is secondary. Return JSON only with subject_type and descriptor.';
}

export function buildReviewInstruction({ requirement = '', anatomyApplies = humanAnatomyApplicable(requirement), referenceWeight = 0, hasReference = false, threshold = 80 } = {}) {
  const referencePercent = hasReference ? Math.round(Math.max(0, Math.min(0.5, Number(referenceWeight) || 0)) * 100) : 0;
  return `Act as an image quality inspector. Original requirement:\n${requirement}\nHuman-anatomy review applicable: ${anatomyApplies}. If false, never inspect, mention, deduct for, or add anatomy/hands/fingers/limbs/body structure to prompt_patch.\nInspect prompt consistency, composition, clarity, and artifacts; inspect anatomy and hands only when applicable. Reference similarity is secondary (${referencePercent}%) and never a hard failure. The user prompt overrides the reference.\nDo NOT evaluate text, logos, content sensitivity, safety, public-release suitability, commercial use, advertising rules, copyright, or brand rules.\nReturn JSON only: score (0-100), hard_failures (array), issues (Chinese array), prompt_patch (English), summary (Chinese). pass requires score >= ${threshold} and no hard failures.`;
}
