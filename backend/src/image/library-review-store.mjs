import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_REVIEWS = 1_000;
const MAX_TEXT = 2_000;

function itemId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 260 || value.includes('..') || /[\\/\0\r\n]/.test(value)) throw new Error('LIBRARY_REVIEW_ITEM_ID_INVALID');
  return value;
}
function itemIds(value) {
  if (!Array.isArray(value) || value.length > MAX_REVIEWS) throw new Error('LIBRARY_REVIEW_ITEM_IDS_INVALID');
  return [...new Set(value.map(itemId))];
}
function shortText(value) { return typeof value === 'string' ? value.slice(0, MAX_TEXT) : ''; }
function normalizeReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LIBRARY_REVIEW_INVALID');
  const state = ['completed', 'unavailable', 'failed'].includes(value.state) ? value.state : null;
  if (!state) throw new Error('LIBRARY_REVIEW_INVALID');
  const score = Number.isInteger(value.score) && value.score >= 0 && value.score <= 100 ? value.score : undefined;
  return Object.freeze({
    state, ...(score === undefined ? {} : { score }), ...(typeof value.pass === 'boolean' ? { pass: value.pass } : {}),
    detail: shortText(value.detail), model: shortText(value.model), summary: shortText(value.summary), prompt_patch: shortText(value.prompt_patch),
    issues: Array.isArray(value.issues) ? value.issues.slice(0, 20).map(shortText) : [],
    hard_failures: Array.isArray(value.hard_failures) ? value.hard_failures.slice(0, 20).map(shortText) : [],
  });
}

export function createLibraryReviewStore({ userDataRoot } = {}) {
  if (typeof userDataRoot !== 'string' || !path.isAbsolute(userDataRoot)) throw new Error('LIBRARY_REVIEW_ROOT_REQUIRED');
  const directory = path.join(userDataRoot, 'history');
  const target = path.join(directory, 'library-reviews.json');
  async function read() {
    const raw = await readFile(target, 'utf8').catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (raw === null) return {};
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > MAX_REVIEWS) throw new Error('LIBRARY_REVIEW_STORE_INVALID');
    return Object.fromEntries(Object.entries(value).map(([key, review]) => [itemId(key), normalizeReview(review)]));
  }
  async function write(value) {
    await mkdir(directory, { recursive: true });
    const temporary = `${target}.partial`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8');
    await rename(temporary, target);
  }
  return Object.freeze({
    async list() { return Object.freeze(await read()); },
    async set(libraryItemId, review) {
      const all = await read();
      const id = itemId(libraryItemId); all[id] = normalizeReview(review);
      if (Object.keys(all).length > MAX_REVIEWS) throw new Error('LIBRARY_REVIEW_STORE_LIMIT');
      await write(all); return all[id];
    },
    async removeMany(libraryItemIds) {
      const ids = itemIds(libraryItemIds); const all = await read();
      let removed = 0;
      for (const id of ids) if (Object.hasOwn(all, id)) { delete all[id]; removed += 1; }
      if (removed > 0) await write(all);
      return Object.freeze({ removed });
    },
  });
}
