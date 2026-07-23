import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createComfyClient } from './comfy-client.mjs';
import { httpBaseForPrivateAddress, isPrivateNetworkAddress } from './private-network.mjs';
import { archiveImage } from './library-store.mjs';
import { writePngMetadata } from './png-metadata.mjs';
import {
  FLUX_CHECKPOINT,
  FLUX_CLIP_L,
  FLUX_T5,
  FLUX_UNET,
  FLUX_VAE,
  ILLUSTRIOUS_CHECKPOINT,
  PONY_CHECKPOINT,
  PONY_VAE,
  buildFluxWorkflow,
  buildIllustriousWorkflow,
  buildPonyWorkflow,
  prepareIllustriousPrompt,
  preparePonyPrompt,
} from './workflow-builders.mjs';
import { inspectRegisteredCore, supportedCoreSelection } from './core-model-registry.mjs';

const MAX_PROMPT_LENGTH = 8_000;
const MAX_STEPS = 80;
const MAX_GUIDANCE = 30;
const MAX_SEED = 4_294_967_295;
const HISTORY_WAIT_MS = 2_000;
const HISTORY_MAX_POLLS = 300;
const MAX_SESSION_JOBS = 100;

function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}_INVALID`);
  return value;
}
function decimal(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label}_INVALID`);
  return value;
}
function text(value, label, { required = false, max = MAX_PROMPT_LENGTH } = {}) {
  if (typeof value !== 'string' || value.length > max || /\0/.test(value)) throw new Error(`${label}_INVALID`);
  const cleaned = value.trim();
  if (required && cleaned.length === 0) throw new Error(`${label}_REQUIRED`);
  return cleaned;
}
function loraName(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 600 || /[\\\0\r\n]/.test(value) || !value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')) throw new Error('GENERATION_LORA_INVALID');
  return value;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function createSeedPlan({ mode = 'increment', seed = 1, rangeStart = 1, rangeEnd = 1, rounds = 5 } = {}) {
  const count = integer(rounds, 'GENERATION_ROUNDS', 1, 25);
  if (![5, 25].includes(count)) throw new Error('GENERATION_ROUNDS_INVALID');
  const base = integer(seed, 'GENERATION_SEED', 0, MAX_SEED);
  if (mode === 'locked') return Array(count).fill(base);
  if (mode === 'increment') return Array.from({ length: count }, (_item, index) => (base + index) % (MAX_SEED + 1));
  if (mode === 'range_increment') {
    const start = integer(rangeStart, 'GENERATION_SEED_RANGE', 0, MAX_SEED);
    const end = integer(rangeEnd, 'GENERATION_SEED_RANGE', start, MAX_SEED);
    return Array.from({ length: count }, (_item, index) => start + (index % (end - start + 1)));
  }
  throw new Error('GENERATION_SEED_MODE_INVALID');
}

export function normalizeGeneration(value) {
  if (!plainObject(value)) throw new Error('GENERATION_INVALID');
  const allowed = ['prompt', 'negativePrompt', 'width', 'height', 'steps', 'guidance', 'seed', 'seedMode', 'rangeStart', 'rangeEnd', 'rounds', 'referenceId', 'referenceStrength', 'referenceMode', 'loraName', 'loraModelStrength', 'loraClipStrength', 'ponySourceTag', 'ponyRatingTag'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('GENERATION_FIELD_NOT_ALLOWED');
  const rounds = integer(value.rounds ?? 5, 'GENERATION_ROUNDS', 1, 25);
  const seed = integer(value.seed, 'GENERATION_SEED', 0, MAX_SEED);
  const seedMode = String(value.seedMode ?? 'increment');
  const rangeStart = integer(value.rangeStart ?? seed, 'GENERATION_SEED_RANGE', 0, MAX_SEED);
  const rangeEnd = integer(value.rangeEnd ?? rangeStart, 'GENERATION_SEED_RANGE', rangeStart, MAX_SEED);
  const normalized = Object.freeze({
    prompt: text(value.prompt, 'GENERATION_PROMPT', { required: true }),
    negativePrompt: text(value.negativePrompt ?? '', 'GENERATION_NEGATIVE_PROMPT'),
    width: integer(value.width, 'GENERATION_WIDTH', 512, 1536),
    height: integer(value.height, 'GENERATION_HEIGHT', 512, 1536),
    steps: integer(value.steps, 'GENERATION_STEPS', 1, MAX_STEPS),
    guidance: decimal(value.guidance, 'GENERATION_GUIDANCE', 0, MAX_GUIDANCE),
    seed, seedMode, rangeStart, rangeEnd, rounds,
    referenceId: value.referenceId === undefined || value.referenceId === null || value.referenceId === '' ? '' : text(value.referenceId, 'GENERATION_REFERENCE_ID', { max: 200 }),
    referenceStrength: decimal(value.referenceStrength ?? 0.1, 'GENERATION_REFERENCE_STRENGTH', 0, 0.5),
    referenceMode: ['redraw', 'reference_only'].includes(String(value.referenceMode ?? 'redraw')) ? String(value.referenceMode ?? 'redraw') : (() => { throw new Error('GENERATION_REFERENCE_MODE_INVALID'); })(),
    loraName: loraName(value.loraName),
    loraModelStrength: decimal(value.loraModelStrength ?? 0.8, 'GENERATION_LORA_MODEL_STRENGTH', -2, 2),
    loraClipStrength: decimal(value.loraClipStrength ?? 0.8, 'GENERATION_LORA_CLIP_STRENGTH', -2, 2),
    ponySourceTag: ['', 'source_anime', 'source_cartoon', 'source_furry', 'source_pony'].includes(String(value.ponySourceTag ?? '')) ? String(value.ponySourceTag ?? '') : (() => { throw new Error('GENERATION_PONY_TAG_INVALID'); })(),
    ponyRatingTag: ['', 'rating_safe', 'rating_questionable', 'rating_explicit'].includes(String(value.ponyRatingTag ?? '')) ? String(value.ponyRatingTag ?? '') : (() => { throw new Error('GENERATION_PONY_TAG_INVALID'); })(),
  });
  createSeedPlan(normalized);
  return normalized;
}

function queueIsIdle(queue) { return Number(queue?.running ?? 0) === 0 && Number(queue?.pending ?? 0) === 0; }
function verifiedComfyEndpoint(scan) {
  if (!scan || typeof scan.address !== 'string' || !isPrivateNetworkAddress(scan.address)
    || !Number.isInteger(scan.port) || scan.port < 1 || scan.port > 65_535) {
    throw new Error('GENERATION_COMFYUI_ENDPOINT_UNVERIFIED');
  }
  return Object.freeze({ host: scan.address, port: scan.port });
}
function hasCandidate(candidates, candidateId) { return candidates.some((candidate) => candidate.candidateId === candidateId); }
function hasVae(candidates, engine) { return hasCandidate(candidates, `comfy.vae:${engine === 'flux' ? FLUX_VAE : PONY_VAE}`); }
function hasFluxTextEncoders(candidates) {
  return hasCandidate(candidates, `comfy.text_encoders:${FLUX_CLIP_L}`)
    && hasCandidate(candidates, `comfy.text_encoders:${FLUX_T5}`);
}
function hasFluxUnet(candidates) { return hasCandidate(candidates, `comfy.unet:${FLUX_UNET}`); }
function hasLora(candidates, name, engine) {
  if (!name) return true;
  const compatibleDirectory = engine === 'flux'
    ? 'comfy.loras.flux'
    : engine === 'pony' || engine === 'illustrious' ? 'comfy.loras.sdxl' : null;
  return Boolean(compatibleDirectory && candidates.some((candidate) => candidate.displayName === name && candidate.directoryId === compatibleDirectory));
}
function outputSummary(history, promptId) {
  const entry = history?.[promptId];
  if (!entry) return Object.freeze({ state: 'queued', outputs: [] });
  const status = String(entry.status?.status_str ?? '').toLowerCase();
  if (status === 'error' || status === 'failed') return Object.freeze({ state: 'failed', outputs: [] });
  const outputs = [];
  for (const nodeOutput of Object.values(entry.outputs ?? {})) for (const image of nodeOutput?.images ?? []) {
    if (typeof image?.filename === 'string') outputs.push(Object.freeze({ filename: image.filename, subfolder: String(image.subfolder ?? ''), type: image.type === 'temp' ? 'temp' : 'output' }));
  }
  return Object.freeze({ state: status === 'success' || entry.status?.completed === true ? 'completed' : 'running', outputs: Object.freeze(outputs) });
}
function finalJobState(job) {
  // A stop request only means that a *following* round must not be submitted.
  // If it arrives while the final submitted round is being archived/audited,
  // there is no following round to suppress; preserve the actual outcome.
  if (job.stopRequested && job.currentRound < job.seeds.length) return 'stopped';
  const succeeded = job.attempts.filter((attempt) => attempt.state === 'completed').length;
  const failed = job.attempts.filter((attempt) => attempt.state === 'failed').length;
  if (succeeded === job.seeds.length && failed === 0) return 'completed';
  if (succeeded > 0) return 'partial_failed';
  return 'failed';
}
function publicJob(job) {
  return structuredClone({ jobId: job.jobId, engine: job.engine, coreCandidateId: job.coreCandidateId, submittedAt: job.submittedAt, settings: job.settings, state: job.state, currentRound: job.currentRound, rounds: job.settings.rounds, stopRequested: job.stopRequested, message: job.message, attempts: job.attempts });
}

function safeOutputName(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('..') || /[\\/]/.test(value)) throw new Error('GENERATION_OUTPUT_NAME_INVALID');
  return value;
}

async function persistOutputs({ client, job, attempt, outputRoot, libraryRoot }) {
  if (!outputRoot || !libraryRoot) return null;
  const runRoot = path.join(outputRoot, job.jobId);
  await mkdir(runRoot, { recursive: true });
  const saved = [];
  let reviewImagePath = null;
  for (const output of attempt.outputs) {
    if (output.type !== 'output') continue;
    try {
      const response = await client.view(output);
      const fileName = safeOutputName(output.filename);
      const target = path.join(runRoot, `round_${attempt.round}_${fileName}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(target, bytes, { flag: 'wx' });
      if (target.toLowerCase().endsWith('.png')) {
        await writePngMetadata(target, {
          config: {
            engine: job.engine, model_name: job.coreCandidateId.slice('comfy.checkpoints:'.length), prompt: job.settings.prompt,
            seed_mode: job.settings.seedMode, seed_min: job.settings.rangeStart, seed_max: job.settings.rangeEnd,
            steps: job.settings.steps, guidance: job.settings.guidance, width: job.settings.width, height: job.settings.height,
            max_attempts: job.settings.rounds, lora_name: job.settings.loraName, lora_strength_model: job.settings.loraModelStrength,
            lora_strength_clip: job.settings.loraClipStrength, source_tag: job.settings.ponySourceTag, rating_tag: job.settings.ponyRatingTag,
            reference_data: job.settings.referenceId || null, reference_filename: job.reference?.displayName ?? null,
            reference_weight: job.settings.referenceStrength,
          },
          prompt: job.settings.prompt, negativePrompt: job.settings.negativePrompt, seed: attempt.seed, attemptNumber: attempt.round, runId: job.jobId,
        });
      }
      const archivedPath = await archiveImage({ sourcePath: target, libraryRoot, runId: job.jobId, attemptNumber: attempt.round });
      saved.push({ ...output, saved: true, libraryItemId: path.basename(archivedPath) });
      if (!reviewImagePath) reviewImagePath = target;
    } catch (error) {
      saved.push({ ...output, saved: false, archiveError: error instanceof Error ? error.message : 'GENERATION_OUTPUT_ARCHIVE_FAILED' });
    }
  }
  attempt.outputs = saved;
  return reviewImagePath;
}

export function createRealGenerationService({ profileStore, modelSelectionStore, readonlyScan, referenceHandles = null, outputRoot = null, libraryRoot = null, jobHistoryStore = null, libraryReviewStore = null, reviewService = null, clientFactory = createComfyClient, now = () => new Date().toISOString(), randomId = randomUUID, sleepImpl = sleep } = {}) {
  if (!profileStore || typeof profileStore.load !== 'function') throw new Error('GENERATION_PROFILE_STORE_REQUIRED');
  if (!modelSelectionStore || typeof modelSelectionStore.load !== 'function') throw new Error('GENERATION_SELECTION_STORE_REQUIRED');
  if (!readonlyScan || typeof readonlyScan.scan !== 'function') throw new Error('GENERATION_SCAN_REQUIRED');
  if (referenceHandles && typeof referenceHandles.resolve !== 'function') throw new Error('GENERATION_REFERENCE_HANDLES_INVALID');
  if (libraryReviewStore && typeof libraryReviewStore.set !== 'function') throw new Error('GENERATION_LIBRARY_REVIEW_STORE_INVALID');
  if (reviewService && typeof reviewService.review !== 'function') throw new Error('GENERATION_REVIEW_SERVICE_INVALID');
  if (typeof clientFactory !== 'function' || typeof sleepImpl !== 'function') throw new Error('GENERATION_DEPENDENCIES_REQUIRED');
  let jobs = new Map();
  if (jobHistoryStore && (typeof jobHistoryStore.load !== 'function' || typeof jobHistoryStore.save !== 'function')) throw new Error('GENERATION_HISTORY_STORE_INVALID');
  async function persist(items = jobs.values()) { if (jobHistoryStore) await jobHistoryStore.save([...items].map(publicJob)); }

  function nextJobMap(job) {
    const next = new Map(jobs);
    if (next.size >= MAX_SESSION_JOBS) {
      const removable = [...next.values()]
        .filter((item) => ['completed', 'partial_failed', 'failed', 'stopped', 'handoff_required'].includes(item.state))
        .sort((left, right) => String(left.submittedAt).localeCompare(String(right.submittedAt)));
      for (const item of removable) {
        if (next.size < MAX_SESSION_JOBS) break;
        next.delete(item.jobId);
      }
    }
    if (next.size >= MAX_SESSION_JOBS) throw new Error('GENERATION_JOB_CAPACITY_REACHED');
    next.set(job.jobId, job);
    return next;
  }

  async function waitForPrompt(client, promptId) {
    for (let poll = 0; poll < HISTORY_MAX_POLLS; poll += 1) {
      const result = outputSummary(await client.history(promptId), promptId);
      if (result.state === 'completed' || result.state === 'failed') return result;
      await sleepImpl(HISTORY_WAIT_MS);
    }
    return { state: 'failed', outputs: [], error: 'GENERATION_HISTORY_TIMEOUT' };
  }

  async function run(job, verifiedProfile) {
    // Pin upload, submit, history and output requests to the numeric address
    // that passed the initial read-only scan, preventing DNS rebinding.
    const client = clientFactory({ comfyBaseUrl: httpBaseForPrivateAddress(verifiedProfile.host, verifiedProfile.port) });
    try {
      let referenceName;
      if (job.settings.referenceId) {
        if (!referenceHandles) throw new Error('GENERATION_REFERENCE_NOT_AVAILABLE');
        const referencePath = referenceHandles.resolve(job.settings.referenceId);
        const extension = path.extname(referencePath).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('GENERATION_REFERENCE_FILE_TYPE_NOT_ALLOWED');
        const bytes = await readFile(referencePath);
        if (bytes.length > 20 * 1024 * 1024) throw new Error('GENERATION_REFERENCE_FILE_TOO_LARGE');
        job.state = 'uploading_reference'; job.message = '正在上传参考图到已连接的 ComfyUI。';
        const upload = await client.uploadImage({ fileName: path.basename(referencePath), blob: new Blob([bytes]), overwrite: false });
        referenceName = typeof upload?.name === 'string' ? upload.name : path.basename(referencePath);
        job.reference = { displayName: path.basename(referencePath), remoteName: referenceName, strength: job.settings.referenceStrength, mode: job.settings.referenceMode };
      }
      for (let index = 0; index < job.seeds.length; index += 1) {
        if (job.stopRequested) break;
        job.state = 'waiting_for_queue'; job.message = `等待第 ${index + 1}/${job.seeds.length} 轮的安全提交时机`;
        const scan = await readonlyScan.scan(verifiedProfile);
        if (job.stopRequested) break;
        if (scan.state !== 'reachable') throw new Error('GENERATION_COMFYUI_SCAN_REQUIRED');
        if (!queueIsIdle(scan.queue)) throw new Error('GENERATION_QUEUE_BECAME_BUSY');
        const seed = job.seeds[index];
        const common = { ...job.settings, seed, checkpointName: job.coreCandidateId.slice('comfy.checkpoints:'.length), referenceName, referenceDenoise: 1 - job.settings.referenceStrength, referenceMode: job.settings.referenceMode === 'reference_only' ? 'reference_only' : 'redraw', loraName: job.settings.loraName || undefined, loraStrengthModel: job.settings.loraModelStrength, loraStrengthClip: job.settings.loraClipStrength, prefix: `DGX_ImageWorkbench_${job.jobId}/round_${index + 1}` };
        const workflow = job.engine === 'flux'
          ? buildFluxWorkflow({ ...common, modelName: FLUX_UNET, prompt: job.settings.prompt })
          : job.engine === 'pony'
            ? buildPonyWorkflow({ ...common, prompt: preparePonyPrompt(job.settings.prompt, { sourceTag: job.settings.ponySourceTag, ratingTag: job.settings.ponyRatingTag }) })
            : buildIllustriousWorkflow({ ...common, prompt: prepareIllustriousPrompt(job.settings.prompt) });
        job.state = 'submitting'; job.message = `正在提交第 ${index + 1}/${job.seeds.length} 轮`;
        const response = await client.submitPrompt(workflow, `dgximg${job.jobId.slice(4, 28)}`);
        if (typeof response?.prompt_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(response.prompt_id)) throw new Error('GENERATION_COMFYUI_PROMPT_ID_INVALID');
        const attempt = { round: index + 1, seed, promptId: response.prompt_id, state: 'generating', outputs: [] };
        job.attempts.push(attempt); job.currentRound = index + 1; job.state = 'generating'; job.message = `第 ${index + 1}/${job.seeds.length} 轮正在生成`;
        await persist();
        // Stop deliberately never interrupts the shared ComfyUI queue.  Once
        // a prompt was submitted, continue polling and archive its result;
        // stopRequested is consumed only before a following submission.
        const result = await waitForPrompt(client, response.prompt_id);
        attempt.state = result.state; attempt.outputs = result.outputs; if (result.error) attempt.error = result.error;
        if (result.state === 'completed') {
          const reviewImagePath = await persistOutputs({ client, job, attempt, outputRoot, libraryRoot });
          if (reviewService) {
            job.state = 'auditing'; job.message = `第 ${index + 1}/${job.seeds.length} 轮已生成，正在请求 VLM 审核。`;
            await persist();
            attempt.review = reviewImagePath
              ? await reviewService.review({ imagePath: reviewImagePath, requirement: job.settings.prompt, referenceWeight: job.settings.referenceStrength, hasReference: Boolean(job.settings.referenceId) })
              : Object.freeze({ state: 'unavailable', detail: 'VLM 审核未运行：本轮没有可归档的图像输出。' });
            if (libraryReviewStore) for (const output of attempt.outputs) {
              if (output?.saved && typeof output.libraryItemId === 'string') await libraryReviewStore.set(output.libraryItemId, attempt.review);
            }
          }
        }
        if (result.state === 'failed') job.message = `第 ${index + 1} 轮失败，继续下一轮`;
        await persist();
        if (job.stopRequested) break;
      }
      job.state = finalJobState(job);
      const succeeded = job.attempts.filter((attempt) => attempt.state === 'completed').length;
      const failed = job.attempts.filter((attempt) => attempt.state === 'failed').length;
      job.message = job.state === 'stopped'
        ? job.currentRound > 0
          ? `已停止后续轮次；已提交的第 ${job.currentRound} 轮已完成跟踪与归档。`
          : '已停止；尚未向 ComfyUI 提交任何轮次。'
        : job.state === 'completed'
          ? `${job.seeds.length} 轮真实 ComfyUI 任务全部完成。`
          : job.state === 'partial_failed'
            ? `任务部分失败：${succeeded} 轮完成，${failed} 轮失败。`
            : `任务失败：没有成功完成的轮次（${failed} 轮失败）。`;
      await persist();
    } catch (error) {
      const succeeded = job.attempts.filter((attempt) => attempt.state === 'completed').length;
      job.state = succeeded > 0 ? 'partial_failed' : 'failed';
      job.message = error instanceof Error ? error.message : 'GENERATION_FAILED';
      await persist();
    }
  }

  async function start(generation) {
    const settings = normalizeGeneration(generation);
    const [profile, selection] = await Promise.all([profileStore.load(), modelSelectionStore.load()]);
    if (!profile) throw new Error('GENERATION_COMFYUI_PROFILE_REQUIRED');
    if (!selection?.coreCandidateId) throw new Error('GENERATION_CORE_SELECTION_REQUIRED');
    const selectedCore = supportedCoreSelection(selection);
    if (!selectedCore) throw new Error('GENERATION_CORE_REQUIRES_REGISTERED_VERIFICATION');
    const scan = await readonlyScan.scan(profile);
    if (scan.state !== 'reachable') throw new Error('GENERATION_COMFYUI_SCAN_REQUIRED');
    const verifiedProfile = verifiedComfyEndpoint(scan);
    if (!queueIsIdle(scan.queue)) throw new Error('GENERATION_QUEUE_NOT_IDLE');
    const candidate = scan.candidates.find((item) => item.candidateId === selection.coreCandidateId && item.directoryId === 'comfy.checkpoints');
    if (!candidate) throw new Error('GENERATION_CORE_NOT_DISCOVERED');
    const inspected = inspectRegisteredCore(candidate, scan.candidates);
    if (!inspected || inspected.coreId !== selectedCore.coreId) throw new Error('GENERATION_CORE_NOT_REGISTERED');
    if (inspected.compatibility !== 'workflow_ready') throw new Error('GENERATION_CORE_DEPENDENCIES_MISSING');
    const engine = selectedCore.engine;
    if (!hasVae(scan.candidates, engine)) throw new Error('GENERATION_VAE_NOT_DISCOVERED');
    if (engine === 'flux' && !hasFluxUnet(scan.candidates)) throw new Error('GENERATION_FLUX_UNET_NOT_DISCOVERED');
    if (engine === 'flux' && !hasFluxTextEncoders(scan.candidates)) throw new Error('GENERATION_FLUX_TEXT_ENCODER_NOT_DISCOVERED');
    if (!hasLora(scan.candidates, settings.loraName, engine)) throw new Error('GENERATION_LORA_INCOMPATIBLE');
    const job = { jobId: `job_${randomId().replace(/-/g, '')}`, engine, coreCandidateId: selection.coreCandidateId, submittedAt: now(), settings, seeds: createSeedPlan(settings), state: 'queued', currentRound: 0, stopRequested: false, message: '任务已创建，等待第一轮提交。', attempts: [] };
    const next = nextJobMap(job);
    // Persist the candidate map before publishing it to the live session.
    // A full disk or serialization failure therefore cannot leave an
    // untracked 101st job in memory.
    await persist(next.values());
    jobs = next;
    void run(job, verifiedProfile);
    return publicJob(job);
  }
  async function get(jobId) { const job = jobs.get(jobId); if (!job || typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('GENERATION_JOB_NOT_FOUND_IN_SESSION'); return publicJob(job); }
  async function stop(jobId) { const job = jobs.get(jobId); if (!job || typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('GENERATION_JOB_NOT_FOUND_IN_SESSION'); job.stopRequested = true; job.message = '已请求停止：当前轮若已提交会等待其完成，但不会向共享 ComfyUI 发送全局中断。'; await persist(); return publicJob(job); }
  async function list() { return Object.freeze([...jobs.values()].map(publicJob).sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))); }
  async function recover() {
    if (!jobHistoryStore) return Object.freeze({ restored: 0, handedOff: 0 });
    const saved = await jobHistoryStore.load(); let handedOff = 0;
    for (const item of saved) {
      const job = structuredClone(item);
      if (!['completed', 'partial_failed', 'failed', 'stopped'].includes(job.state)) {
        job.state = 'handoff_required';
        job.stopRequested = true;
        job.message = '工作台在此任务完成前重启。未重新提交、取消或清空 ComfyUI；请使用下方已保存的 prompt ID 到 ComfyUI history 核对结果。';
        handedOff += 1;
      }
      jobs.set(job.jobId, job);
    }
    await persist();
    return Object.freeze({ restored: saved.length, handedOff });
  }
  return Object.freeze({ start, get, stop, list, recover });
}
