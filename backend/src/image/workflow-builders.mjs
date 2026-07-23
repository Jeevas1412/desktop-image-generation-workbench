export const PONY_CHECKPOINT = 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors';
export const PONY_VAE = 'sdxl_vae.safetensors';
export const ILLUSTRIOUS_CHECKPOINT = 'Illustrious-XL-v0.1.safetensors';
// Flux Kontext is loaded through UNETLoader even though this ComfyUI instance
// also discovers the same file under checkpoints.  This matches the verified
// Flux graph and keeps its required assets explicit.
export const FLUX_CHECKPOINT = 'flux1-dev-kontext_fp8_scaled.safetensors';
export const FLUX_UNET = FLUX_CHECKPOINT;
export const FLUX_VAE = 'ae.safetensors';
export const FLUX_CLIP_L = 'clip_l.safetensors';
export const FLUX_T5 = 't5xxl_fp16.safetensors';
export const PONY_QUALITY_TAGS = ['score_9', 'score_8_up', 'score_7_up', 'score_6_up', 'score_5_up', 'score_4_up'];
export const ILLUSTRIOUS_QUALITY_TAGS = ['masterpiece', 'best quality'];

function cleanPrompt(value) {
  return String(value ?? '').trim().replace(/^,+|,+$/g, '').trim();
}

function addMissingTags(prompt, required) {
  const cleaned = cleanPrompt(prompt);
  const lower = cleaned.toLowerCase();
  return [...required.filter((tag) => !lower.includes(tag)), ...(cleaned ? [cleaned] : [])].join(', ');
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function preparePonyPrompt(prompt, { sourceTag = '', ratingTag = '' } = {}) {
  const cleaned = cleanPrompt(prompt);
  const lower = cleaned.toLowerCase();
  const extras = [];
  if (sourceTag && !/\bsource_(?:pony|furry|cartoon|anime)\b/.test(lower)) extras.push(sourceTag);
  if (ratingTag && !/\brating_(?:safe|questionable|explicit)\b/.test(lower)) extras.push(ratingTag);
  return [...PONY_QUALITY_TAGS.filter((tag) => !lower.includes(tag)), ...extras, ...(cleaned ? [cleaned] : [])].join(', ');
}

export function prepareIllustriousPrompt(prompt) {
  return addMissingTags(prompt, ILLUSTRIOUS_QUALITY_TAGS);
}

export function illustriousNativeBucket(width, height) {
  const ratio = number(width, 640) / Math.max(1, number(height, 640));
  if (ratio >= 1.4) return { width: 1344, height: 768 };
  if (ratio >= 1.15) return { width: 1152, height: 896 };
  if (ratio <= 1 / 1.4) return { width: 768, height: 1344 };
  if (ratio <= 1 / 1.15) return { width: 896, height: 1152 };
  return { width: 1024, height: 1024 };
}

export function buildFluxWorkflow({ prompt, seed, width = 1024, height = 1024, steps = 20, guidance = 3.5, prefix = 'MD01_VLM', referenceName, referenceDenoise = 0.05, referenceMode = 'redraw', loraName, loraStrengthModel = 0.8, loraStrengthClip = 0.8, modelName = FLUX_UNET, samplerName = 'euler', scheduler = 'simple', negativePrompt = '' } = {}) {
  const graph = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: modelName, weight_dtype: 'default' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: FLUX_CLIP_L, clip_name2: FLUX_T5, type: 'flux' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: FLUX_VAE } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: String(prompt ?? ''), clip: ['2', 0] } },
    '5': { class_type: 'FluxGuidance', inputs: { conditioning: ['4', 0], guidance } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: String(negativePrompt ?? ''), clip: ['2', 0] } },
    '7': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '8': { class_type: 'KSampler', inputs: { model: ['1', 0], seed, steps, cfg: 1.0, sampler_name: samplerName, scheduler, positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], denoise: 1.0 } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['9', 0] } },
  };
  if (referenceName) {
    graph['7'] = { class_type: 'LoadImage', inputs: { image: referenceName } };
    graph['11'] = { class_type: 'ImageScale', inputs: { image: ['7', 0], upscale_method: 'lanczos', width, height, crop: 'center' } };
    graph['12'] = { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['3', 0] } };
    graph['8'].inputs.latent_image = ['12', 0];
    let denoise = Math.max(0.01, Math.min(0.95, number(referenceDenoise, 0.05)));
    if (referenceMode === 'redraw') denoise = Math.max(0.75, denoise);
    graph['8'].inputs.denoise = denoise;
  }
  if (loraName) {
    graph['13'] = { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['2', 0], lora_name: loraName, strength_model: number(loraStrengthModel, 0.8), strength_clip: number(loraStrengthClip, 0.8) } };
    graph['4'].inputs.clip = ['13', 1]; graph['6'].inputs.clip = ['13', 1]; graph['8'].inputs.model = ['13', 0];
  }
  return graph;
}

function buildSdxlWorkflow(options) {
  const { prompt, negativePrompt = '', seed, width, height, outputWidth, outputHeight, steps, guidance, prefix, checkpointName, vaeName, loraName, loraStrengthModel, loraStrengthClip, samplerName, scheduler, referenceName, referenceDenoise = 0.75, referenceMode = 'redraw', illustrious = false } = options;
  const conditioning = (text) => illustrious
    ? { class_type: 'CLIPTextEncodeSDXL', inputs: { clip: ['10', 0], width, height, crop_w: 0, crop_h: 0, target_width: width, target_height: height, text_g: String(text ?? ''), text_l: String(text ?? '') } }
    : { class_type: 'CLIPTextEncode', inputs: { text: String(text ?? ''), clip: ['10', 0] } };
  const graph = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpointName } },
    '2': { class_type: 'VAELoader', inputs: { vae_name: vaeName } },
    '10': { class_type: 'CLIPSetLastLayer', inputs: { clip: ['1', 1], stop_at_clip_layer: -2 } },
    '3': conditioning(prompt), '4': conditioning(negativePrompt),
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: { model: ['1', 0], seed, steps, cfg: guidance, sampler_name: samplerName, scheduler, positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], denoise: 1.0 } },
    '7': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['2', 0] } },
  };
  if (illustrious) {
    graph['11'] = { class_type: 'ImageScale', inputs: { image: ['7', 0], upscale_method: 'lanczos', width: outputWidth, height: outputHeight, crop: 'disabled' } };
    graph['8'] = { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['11', 0] } };
  } else graph['8'] = { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['7', 0] } };
  if (referenceName) {
    graph['12'] = { class_type: 'LoadImage', inputs: { image: referenceName } };
    graph['13'] = { class_type: 'ImageScale', inputs: { image: ['12', 0], upscale_method: 'lanczos', width, height, crop: 'center' } };
    graph['14'] = { class_type: 'VAEEncode', inputs: { pixels: ['13', 0], vae: ['2', 0] } };
    graph['6'].inputs.latent_image = ['14', 0];
    const requested = Math.max(0.01, Math.min(0.95, number(referenceDenoise, 0.75)));
    graph['6'].inputs.denoise = referenceMode === 'redraw' ? Math.max(0.75, requested) : requested;
  }
  if (loraName) {
    const loraNode = referenceName ? '15' : '9';
    graph[loraNode] = { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: loraName, strength_model: number(loraStrengthModel, 0.8), strength_clip: number(loraStrengthClip, 0.8) } };
    graph['10'].inputs.clip = [loraNode, 1]; graph['6'].inputs.model = [loraNode, 0];
  }
  return graph;
}

export function buildPonyWorkflow(options = {}) {
  return buildSdxlWorkflow({ ...options, width: options.width ?? 1024, height: options.height ?? 1024, steps: options.steps ?? 25, guidance: options.guidance ?? 7.0, prefix: options.prefix ?? 'MD01_PONY', checkpointName: options.checkpointName ?? PONY_CHECKPOINT, vaeName: options.vaeName ?? PONY_VAE, samplerName: options.samplerName ?? 'euler_ancestral', scheduler: options.scheduler ?? 'normal' });
}

export function buildIllustriousWorkflow(options = {}) {
  const outputWidth = options.width ?? 640; const outputHeight = options.height ?? 640;
  const native = illustriousNativeBucket(outputWidth, outputHeight);
  return buildSdxlWorkflow({ ...options, width: native.width, height: native.height, outputWidth, outputHeight, steps: options.steps ?? 24, guidance: options.guidance ?? 6.0, prefix: options.prefix ?? 'MD01_ILLUSTRIOUS', checkpointName: options.checkpointName ?? ILLUSTRIOUS_CHECKPOINT, vaeName: options.vaeName ?? PONY_VAE, samplerName: options.samplerName ?? 'euler_ancestral', scheduler: options.scheduler ?? 'normal', illustrious: true });
}
