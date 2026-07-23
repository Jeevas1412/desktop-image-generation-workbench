import { readFile, rename, writeFile } from 'node:fs/promises';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CONTROLLED_TEXT_KEYS = new Set(['Title', 'Description', 'Comment', 'Software', 'prompt', 'negative_prompt', 'parameters', 'generation_parameters']);
const ENGINE_NAMES = Object.freeze({ pony: 'Pony Diffusion V6 XL 动画人像', illustrious_lowres: 'Illustrious XL 动画人像', flux: 'FLUX.1 Dev 真实通用' });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const kind = Buffer.from(type, 'ascii'); const header = Buffer.alloc(8); header.writeUInt32BE(data.length, 0); kind.copy(header, 4);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([kind, data])), 0);
  return Buffer.concat([header, data, tail]);
}

function parseChunks(data) {
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG_SIGNATURE_INVALID');
  const chunks = []; let offset = 8;
  while (offset < data.length) {
    if (offset + 12 > data.length) throw new Error('PNG_CHUNK_TRUNCATED');
    const length = data.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > data.length) throw new Error('PNG_CHUNK_TRUNCATED');
    chunks.push({ type: data.subarray(offset + 4, offset + 8).toString('ascii'), data: data.subarray(offset + 8, offset + 8 + length) });
    offset = end;
  }
  if (chunks.at(-1)?.type !== 'IEND') throw new Error('PNG_IEND_MISSING');
  return chunks;
}

function textChunk(key, value) { return chunk('tEXt', Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(String(value), 'utf8')])); }
function existingTextKey(data) { const separator = data.indexOf(0); return separator < 1 ? '' : data.subarray(0, separator).toString('latin1'); }
function xpText(value) { return Buffer.concat([Buffer.from(String(value), 'utf16le'), Buffer.from([0, 0])]); }
function ascii(value) { return Buffer.concat([Buffer.from(String(value), 'utf8'), Buffer.from([0])]); }

function buildExif({ title, parameters, prompt, keywords }) {
  const entries = [
    [0x010e, 2, ascii(prompt)], [0x0131, 2, ascii('DGX 智能生图工作台')],
    [0x9c9b, 1, xpText(title)], [0x9c9c, 1, xpText(parameters)], [0x9c9d, 1, xpText('DGX 智能生图工作台')],
    [0x9c9e, 1, xpText(keywords)], [0x9c9f, 1, xpText(prompt)],
  ];
  const ifdOffset = 8; const valueOffset = ifdOffset + 2 + entries.length * 12 + 4;
  const header = Buffer.alloc(valueOffset); header.write('II', 0, 'ascii'); header.writeUInt16LE(42, 2); header.writeUInt32LE(ifdOffset, 4); header.writeUInt16LE(entries.length, ifdOffset);
  let cursor = valueOffset; const values = [];
  entries.forEach(([tag, type, value], index) => {
    const entry = ifdOffset + 2 + index * 12; header.writeUInt16LE(tag, entry); header.writeUInt16LE(type, entry + 2); header.writeUInt32LE(value.length, entry + 4);
    if (value.length <= 4) value.copy(header, entry + 8); else { header.writeUInt32LE(cursor, entry + 8); values.push(value); cursor += value.length; }
  });
  return Buffer.concat([header, ...values]);
}

export function buildGenerationMetadata({ config = {}, prompt = '', negativePrompt = '', seed, attemptNumber, runId, generatedAt = new Date().toISOString() } = {}) {
  const engine = String(config.engine ?? ''); const engineName = ENGINE_NAMES[engine] ?? engine;
  const lora = config.lora_name || 'None'; const referenceUsed = Boolean(config.reference_data);
  const details = {
    software: 'DGX 智能生图工作台', run_id: runId, generated_at: generatedAt, engine, engine_name: engineName, model: config.model_name,
    prompt: String(prompt), original_prompt: config.prompt, negative_prompt: String(negativePrompt || ''), seed: Number(seed), seed_mode: config.seed_mode,
    seed_min: config.seed_min, seed_max: config.seed_max, steps: config.steps, cfg: config.guidance, sampler: config.sampler_name,
    scheduler: config.scheduler, width: config.width, height: config.height, preset: config.preset, ratio: config.ratio,
    attempt: Number(attemptNumber), attempts: config.max_attempts, lora, lora_model_weight: config.lora_strength_model,
    lora_text_weight: config.lora_strength_clip, pony_source_tag: config.source_tag, pony_rating_tag: config.rating_tag,
    reference_used: referenceUsed, reference_filename: referenceUsed ? config.reference_filename : null,
    reference_review_enabled: config.reference_weight_enabled, reference_review_weight: config.reference_weight, vlm_threshold: config.threshold,
  };
  const parameters = `${details.prompt}${details.negative_prompt ? `\nNegative prompt: ${details.negative_prompt}` : ''}\nSteps: ${details.steps}, Sampler: ${details.sampler}, Schedule type: ${details.scheduler}, CFG scale: ${details.cfg}, Seed: ${details.seed}, Size: ${details.width}x${details.height}, Model: ${details.model}, Engine: ${engineName}, LoRA: ${lora}, Attempt: ${details.attempt}/${details.attempts}, Seed mode: ${details.seed_mode}, Reference: ${referenceUsed}`;
  const title = `${engineName} · ${details.width}x${details.height} · Seed ${details.seed}`;
  const keywords = [engineName, details.model, lora === 'None' ? '' : lora].filter(Boolean).join(', ');
  return { details, parameters, title, keywords, text: { Title: title, Description: details.prompt, Comment: parameters, Software: details.software, prompt: details.prompt, negative_prompt: details.negative_prompt, parameters, generation_parameters: JSON.stringify(details) } };
}

export function embedPngMetadataBytes(png, metadata) {
  const chunks = parseChunks(png); const kept = chunks.filter((item) => item.type !== 'eXIf' && !(item.type === 'tEXt' && CONTROLLED_TEXT_KEYS.has(existingTextKey(item.data))));
  const injected = [...Object.entries(metadata.text).map(([key, value]) => textChunk(key, value)), chunk('eXIf', buildExif({ title: metadata.title, parameters: metadata.parameters, prompt: metadata.details.prompt, keywords: metadata.keywords }))];
  const output = [PNG_SIGNATURE];
  for (const item of kept) { if (item.type === 'IEND') output.push(...injected); output.push(chunk(item.type, item.data)); }
  return Buffer.concat(output);
}

export async function writePngMetadata(filePath, input) {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.png')) throw new Error('PNG_PATH_REQUIRED');
  const metadata = buildGenerationMetadata(input); const source = await readFile(filePath); const temporary = `${filePath}.metadata.tmp`;
  await writeFile(temporary, embedPngMetadataBytes(source, metadata)); await rename(temporary, filePath); return metadata;
}

export function readPngTextMetadata(png) {
  const result = {};
  for (const item of parseChunks(png)) if (item.type === 'tEXt') { const separator = item.data.indexOf(0); if (separator > 0) result[item.data.subarray(0, separator).toString('latin1')] = item.data.subarray(separator + 1).toString('utf8'); }
  return result;
}
