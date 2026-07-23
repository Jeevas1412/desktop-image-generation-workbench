import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_JOBS = 100;

function validJob(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && typeof value.jobId === 'string' && /^job_[A-Za-z0-9_-]+$/.test(value.jobId)
    && typeof value.state === 'string' && Array.isArray(value.attempts);
}

export function createJobHistoryStore({ userDataRoot } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('JOB_HISTORY_ROOT_REQUIRED');
  const directory = path.join(userDataRoot, 'history');
  const target = path.join(directory, 'jobs.json');
  return Object.freeze({
    async load() {
      const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (raw === null) return Object.freeze([]);
      if (Buffer.byteLength(raw, 'utf8') > MAX_HISTORY_BYTES) throw new Error('JOB_HISTORY_TOO_LARGE');
      const value = JSON.parse(raw);
      if (!Array.isArray(value) || value.length > MAX_JOBS || value.some((item) => !validJob(item))) throw new Error('JOB_HISTORY_INVALID');
      return Object.freeze(value.map((item) => structuredClone(item)));
    },
    async save(jobs) {
      if (!Array.isArray(jobs) || jobs.length > MAX_JOBS || jobs.some((item) => !validJob(item))) throw new Error('JOB_HISTORY_INVALID');
      const serialized = `${JSON.stringify(jobs)}\n`;
      if (Buffer.byteLength(serialized, 'utf8') > MAX_HISTORY_BYTES) throw new Error('JOB_HISTORY_TOO_LARGE');
      await mkdir(directory, { recursive: true });
      const temporary = `${target}.partial`;
      await writeFile(temporary, serialized, 'utf8');
      await rename(temporary, target);
    },
  });
}
