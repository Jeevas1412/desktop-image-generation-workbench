import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function positiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function createSeedPlan({ mode = 'locked', seed = 1, rangeStart = 1, rangeEnd = 1, rounds = 5 } = {}) {
  const count = [5, 25].includes(rounds) ? rounds : (() => { throw new Error('JOB_ROUNDS_NOT_ALLOWED'); })();
  const base = positiveInt(seed, 1);
  if (mode === 'locked') return Array(count).fill(base);
  if (mode === 'increment') return Array.from({ length: count }, (_, index) => base + index);
  if (mode === 'range_increment') {
    const start = positiveInt(rangeStart, 1); const end = positiveInt(rangeEnd, start);
    if (end < start) throw new Error('JOB_SEED_RANGE_INVALID');
    return Array.from({ length: count }, (_, index) => start + (index % (end - start + 1)));
  }
  throw new Error('JOB_SEED_MODE_NOT_ALLOWED');
}

export function createImageJob({ jobId, ownerId, rounds = 5, seedMode = 'locked', seed, rangeStart, rangeEnd, createdAt = new Date().toISOString() } = {}) {
  if (typeof jobId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('JOB_ID_NOT_ALLOWED');
  if (typeof ownerId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(ownerId)) throw new Error('JOB_OWNER_NOT_ALLOWED');
  const seeds = createSeedPlan({ mode: seedMode, seed, rangeStart, rangeEnd, rounds });
  return { version: 1, jobId, ownerId, createdAt, rounds, seedMode, seeds, currentRound: 0, status: 'queued', stopRequested: false, attempts: [] };
}

function clone(job) { return structuredClone(job); }

export function beginRound(job, ownerId) {
  const next = clone(job);
  if (next.ownerId !== ownerId) throw new Error('JOB_NOT_OWNED');
  if (next.stopRequested) { next.status = 'stopped'; return next; }
  if (next.currentRound >= next.rounds) { next.status = 'completed'; return next; }
  next.status = 'running';
  const index = next.currentRound;
  next.attempts.push({ round: index + 1, seed: next.seeds[index], status: 'generating' });
  return next;
}

export function completeRound(job, ownerId, { promptId = '', review = null, artifact = null } = {}) {
  const next = clone(job);
  if (next.ownerId !== ownerId) throw new Error('JOB_NOT_OWNED');
  const attempt = next.attempts.at(-1);
  if (next.status !== 'running' || !attempt || attempt.status !== 'generating') throw new Error('JOB_ROUND_NOT_ACTIVE');
  attempt.status = next.stopRequested ? 'stopped' : 'completed'; attempt.promptId = String(promptId); attempt.review = review; attempt.artifact = artifact;
  next.currentRound += 1;
  next.status = next.stopRequested ? 'stopped' : next.currentRound >= next.rounds ? 'completed' : 'queued';
  return next;
}

export function requestStop(job, ownerId) {
  const next = clone(job);
  if (next.ownerId !== ownerId) throw new Error('JOB_NOT_OWNED');
  next.stopRequested = true;
  if (next.status === 'queued') next.status = 'stopped';
  return next;
}

function manifestPath(root, jobId) {
  if (typeof root !== 'string' || root.length === 0) throw new Error('MANIFEST_ROOT_REQUIRED');
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error('JOB_ID_NOT_ALLOWED');
  return path.join(root, `${jobId}.json`);
}

export async function saveManifest(root, job) {
  const target = manifestPath(root, job.jobId); await mkdir(root, { recursive: true });
  const temporary = `${target}.partial`; await writeFile(temporary, `${JSON.stringify(job, null, 2)}\n`, 'utf8'); await rename(temporary, target);
  return target;
}

export async function loadManifest(root, jobId) {
  const value = JSON.parse(await readFile(manifestPath(root, jobId), 'utf8'));
  if (value?.version !== 1 || value?.jobId !== jobId || !Array.isArray(value?.seeds) || !Array.isArray(value?.attempts)) throw new Error('MANIFEST_INVALID');
  return value;
}
