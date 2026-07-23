import { copyFile, lstat, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SEMIFINISHED_MARKER = '.dgx-image-workbench-semifinished-root';

function safeRunId(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('LIBRARY_RUN_ID_NOT_ALLOWED'); return value; }
function safeAttempt(value) { const number = Math.trunc(Number(value)); if (!Number.isInteger(number) || number < 1) throw new Error('LIBRARY_ATTEMPT_INVALID'); return number; }
function safeRoot(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('LIBRARY_ROOT_REQUIRED');
  const root = path.resolve(value);
  if (!path.isAbsolute(value) || root === path.parse(root).root) throw new Error('LIBRARY_ROOT_NOT_ALLOWED');
  return root;
}
function safeFileName(value) { if (typeof value !== 'string' || !/^[^\\/]+$/.test(value) || value.includes('..')) throw new Error('LIBRARY_FILE_NAME_NOT_ALLOWED'); return value; }
function within(root, target) { return path.relative(root, target) !== '' && !path.relative(root, target).startsWith(`..${path.sep}`) && path.relative(root, target) !== '..'; }

async function ensureOwnedSemifinishedRoot(libraryRoot, { create = false, lstatImpl = lstat } = {}) {
  const root = safeRoot(libraryRoot);
  if (create) await mkdir(root, { recursive: true });
  const info = await lstatImpl(root).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error('LIBRARY_ROOT_OWNERSHIP_INVALID');
  const marker = path.join(root, SEMIFINISHED_MARKER);
  const markerInfo = await lstatImpl(marker).catch(() => null);
  if (!markerInfo && create) await writeFile(marker, 'DGX Image Workbench semifinished root\n', { encoding: 'utf8', flag: 'wx' });
  else if (!markerInfo?.isFile() || markerInfo.isSymbolicLink()) throw new Error('LIBRARY_ROOT_OWNERSHIP_INVALID');
  return root;
}

async function cleanupManifest(root) {
  const entries = await readdir(root, { withFileTypes: true }); const files = []; const rejected = [];
  for (const entry of entries) {
    if (entry.name === SEMIFINISHED_MARKER) continue;
    const target = path.join(root, entry.name); const info = await lstat(target);
    if (info.isSymbolicLink() || !entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) { rejected.push(entry.name); continue; }
    files.push({ name: entry.name, size: info.size, mtimeMs: Math.trunc(info.mtimeMs) });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  const encoded = JSON.stringify(files); return { files, rejected, manifestHash: createHash('sha256').update(encoded).digest('hex') };
}

export async function archiveImage({ sourcePath, libraryRoot, runId, attemptNumber }) {
  const source = path.resolve(String(sourcePath ?? '')); const sourceInfo = await stat(source).catch(() => null);
  if (!sourceInfo?.isFile()) throw new Error('LIBRARY_SOURCE_NOT_FOUND');
  const ext = path.extname(source).toLowerCase(); if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('LIBRARY_SOURCE_TYPE_NOT_ALLOWED');
  const root = await ensureOwnedSemifinishedRoot(libraryRoot, { create: true }); const target = path.join(root, `${safeRunId(runId)}_attempt_${safeAttempt(attemptNumber)}${ext}`);
  await copyFile(source, target); return target;
}

export async function listLibrary(libraryRoot) {
  const root = await ensureOwnedSemifinishedRoot(libraryRoot, { create: true });
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({ libraryItemId: entry.name, displayName: entry.name }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function selectReference({ libraryRoot, libraryItemId }, { lstatImpl = lstat, realpathImpl = realpath } = {}) {
  if (typeof lstatImpl !== 'function' || typeof realpathImpl !== 'function') throw new TypeError('LIBRARY_REFERENCE_DEPENDENCIES_REQUIRED');
  const root = await ensureOwnedSemifinishedRoot(libraryRoot, { lstatImpl }); const target = path.resolve(root, safeFileName(libraryItemId));
  if (!within(root, target)) throw new Error('LIBRARY_PATH_NOT_ALLOWED');
  const info = await lstatImpl(target).catch(() => null);
  if (!info?.isFile()) throw new Error('LIBRARY_REFERENCE_NOT_FOUND');
  if (info.isSymbolicLink()) throw new Error('LIBRARY_REFERENCE_LINK_NOT_ALLOWED');
  const [realRoot, realTarget] = await Promise.all([realpathImpl(root), realpathImpl(target)]);
  if (!within(realRoot, realTarget)) throw new Error('LIBRARY_REFERENCE_PATH_NOT_ALLOWED');
  return target;
}

export function createSemifinishedCleanupService({ now = () => Date.now(), randomId = randomUUID, ttlMs = 120_000, onRemoved = null } = {}) {
  if (onRemoved !== null && typeof onRemoved !== 'function') throw new TypeError('LIBRARY_CLEANUP_CALLBACK_INVALID');
  const plans = new Map();
  return Object.freeze({
    async createPlan({ libraryRoot }) {
      const root = await ensureOwnedSemifinishedRoot(libraryRoot); const manifest = await cleanupManifest(root);
      const plan = Object.freeze({ planId: randomId(), createdAt: now(), expiresAt: now() + ttlMs, root, ...manifest }); plans.set(plan.planId, plan);
      return plan;
    },
    async confirm({ libraryRoot, planId }) {
      const plan = plans.get(planId); if (!plan || now() > plan.expiresAt) throw new Error('LIBRARY_CLEANUP_PLAN_INVALID_OR_EXPIRED');
      const root = await ensureOwnedSemifinishedRoot(libraryRoot); if (root !== plan.root) throw new Error('LIBRARY_CLEANUP_ROOT_MISMATCH');
      const current = await cleanupManifest(root); if (current.manifestHash !== plan.manifestHash || current.rejected.length !== plan.rejected.length) throw new Error('LIBRARY_CLEANUP_CONTENT_CHANGED');
      if (plan.rejected.length) throw new Error('LIBRARY_CLEANUP_REJECTED_ENTRIES_PRESENT');
      for (const entry of plan.files) await rm(path.join(root, entry.name), { force: false });
      if (onRemoved) await onRemoved(plan.files.map((entry) => entry.name));
      plans.delete(planId); return { removed: plan.files.length, totalBytes: plan.files.reduce((sum, entry) => sum + entry.size, 0) };
    },
  });
}
