import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGenerationMetadata, embedPngMetadataBytes, readPngTextMetadata, writePngMetadata } from '../src/image/png-metadata.mjs';

const ONE_PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+qXEAAAAASUVORK5CYII=', 'base64');
const input = { config: { engine: 'pony', model_name: 'pony.safetensors', prompt: '原始提示词', seed_mode: 'increment', seed_min: 1, seed_max: 9, steps: 25, guidance: 7, sampler_name: 'euler_ancestral', scheduler: 'normal', width: 1024, height: 1024, preset: 'standard', ratio: '1:1', max_attempts: 5, lora_name: 'style.safetensors', lora_strength_model: 0.8, lora_strength_clip: 0.7, reference_data: true, reference_filename: 'ref.png', reference_weight_enabled: true, reference_weight: 0.1, threshold: 80 }, prompt: 'a futuristic city in fog', negativePrompt: 'low quality', seed: 101, attemptNumber: 2, runId: 'run_meta', generatedAt: '2026-07-20T00:00:00.000Z' };

test('builds Python-baseline compatible parameters and JSON detail fields', () => {
  const metadata = buildGenerationMetadata(input);
  assert.match(metadata.parameters, /Seed: 101/); assert.equal(metadata.details.original_prompt, '原始提示词'); assert.equal(metadata.details.attempt, 2);
  assert.match(metadata.text.generation_parameters, /"reference_filename":"ref.png"/);
});

test('embeds workbench fields and Windows-visible EXIF chunk without changing pixel chunks', () => {
  const output = embedPngMetadataBytes(ONE_PIXEL_PNG, buildGenerationMetadata(input)); const fields = readPngTextMetadata(output);
  assert.equal(fields.prompt, 'a futuristic city in fog'); assert.match(fields.parameters, /Seed: 101/);
  assert.equal(JSON.parse(fields.generation_parameters).attempt, 2); assert.match(output.toString('ascii'), /eXIf/);
});

test('writes metadata atomically to a temporary PNG only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'png-meta-')); const target = path.join(root, 'generated.png');
  try { await writeFile(target, ONE_PIXEL_PNG); await writePngMetadata(target, input); const fields = readPngTextMetadata(await readFile(target)); assert.equal(fields.negative_prompt, 'low quality'); }
  finally { await rm(root, { recursive: true, force: true }); }
});
