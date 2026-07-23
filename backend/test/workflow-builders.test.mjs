import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFluxWorkflow, buildIllustriousWorkflow, buildPonyWorkflow, illustriousNativeBucket, prepareIllustriousPrompt, preparePonyPrompt } from '../src/image/workflow-builders.mjs';

test('FLUX golden structure preserves full redraw reference and LoRA bindings', () => {
  const graph = buildFluxWorkflow({ prompt: 'full body explorer', negativePrompt: '', seed: 11, width: 832, height: 1216, referenceName: 'ref.png', referenceDenoise: 0.1, referenceMode: 'redraw', loraName: 'style.safetensors', loraStrengthModel: 0.6, loraStrengthClip: 0.7 });
  assert.equal(graph['1'].class_type, 'UNETLoader'); assert.equal(graph['2'].inputs.type, 'flux');
  assert.deepEqual(graph['8'].inputs.latent_image, ['12', 0]); assert.equal(graph['8'].inputs.denoise, 0.75);
  assert.deepEqual(graph['8'].inputs.model, ['13', 0]); assert.deepEqual(graph['4'].inputs.clip, ['13', 1]);
  assert.deepEqual(graph['11'].inputs, { image: ['7', 0], upscale_method: 'lanczos', width: 832, height: 1216, crop: 'center' });
});

test('Pony golden structure has SDXL CLIP skip, native sampler, tags and optional LoRA', () => {
  const graph = buildPonyWorkflow({ prompt: 'portrait', negativePrompt: '', seed: 12, loraName: 'pony-style.safetensors' });
  assert.equal(graph['10'].inputs.stop_at_clip_layer, -2); assert.equal(graph['6'].inputs.sampler_name, 'euler_ancestral');
  assert.deepEqual(graph['10'].inputs.clip, ['9', 1]); assert.deepEqual(graph['3'].inputs.clip, ['10', 0]); assert.deepEqual(graph['6'].inputs.model, ['9', 0]);
  const prompt = preparePonyPrompt('score_9, source_anime, a fox', { sourceTag: 'source_pony', ratingTag: 'rating_safe' });
  assert.match(prompt, /^score_8_up/); assert.equal((prompt.match(/score_9/g) ?? []).length, 1); assert.match(prompt, /source_anime/); assert.match(prompt, /rating_safe/);
});

test('Illustrious golden structure uses native bucket then downscales and microconditions', () => {
  const graph = buildIllustriousWorkflow({ prompt: 'city', negativePrompt: '', seed: 13, width: 640, height: 960, loraName: 'ill.safetensors' });
  assert.deepEqual(illustriousNativeBucket(640, 960), { width: 768, height: 1344 });
  assert.equal(graph['3'].class_type, 'CLIPTextEncodeSDXL'); assert.equal(graph['3'].inputs.width, 768); assert.equal(graph['3'].inputs.height, 1344);
  assert.deepEqual(graph['11'].inputs, { image: ['7', 0], upscale_method: 'lanczos', width: 640, height: 960, crop: 'disabled' });
  assert.deepEqual(graph['8'].inputs.images, ['11', 0]); assert.deepEqual(graph['10'].inputs.clip, ['9', 1]);
  assert.equal(prepareIllustriousPrompt('best quality, portrait'), 'masterpiece, best quality, portrait');
});

test('SDXL engines use an uploaded reference as a full redraw source without displacing LoRA bindings', () => {
  const graph = buildPonyWorkflow({ prompt: 'full body explorer', seed: 9, referenceName: 'ref.png', referenceDenoise: 0.1, referenceMode: 'redraw', loraName: 'style.safetensors' });
  assert.deepEqual(graph['6'].inputs.latent_image, ['14', 0]); assert.equal(graph['6'].inputs.denoise, 0.75);
  assert.deepEqual(graph['10'].inputs.clip, ['15', 1]); assert.deepEqual(graph['6'].inputs.model, ['15', 0]);
});
