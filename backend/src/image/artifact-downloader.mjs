import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, open, rename, stat } from 'node:fs/promises';
import path from 'node:path';

function safeFileName(value) {
  if (typeof value !== 'string' || value.length === 0 || path.basename(value) !== value || value.includes('..')) {
    throw new Error('INVALID_FILE_NAME');
  }
  return value;
}

function resolveInside(root, fileName) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, fileName);
  if (path.dirname(resolvedPath) !== resolvedRoot) throw new Error('PATH_NOT_ALLOWED');
  return resolvedPath;
}

async function pathExists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function hashExisting(filePath, hash) {
  if (!(await pathExists(filePath))) return;
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

async function writeResponseBody(response, fileHandle, hash) {
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error('DOWNLOAD_BODY_INVALID');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      await fileHandle.write(chunk);
      hash.update(chunk);
      bytes += chunk.length;
    }
  } finally {
    reader.releaseLock?.();
  }
  return bytes;
}

export function createArtifactDownloader({ targetRoots, fetchImpl = fetch, now = () => new Date() }) {
  if (!targetRoots || typeof targetRoots !== 'object') throw new TypeError('targetRoots is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');

  return async (item) => {
    const root = targetRoots[item?.targetDirectoryId];
    if (typeof root !== 'string' || root.length === 0) throw new Error('PATH_NOT_ALLOWED');
    const fileName = safeFileName(item?.expectedFileName);
    if (typeof item?.sourceUrl !== 'string' || !item.sourceUrl.startsWith('https://')) throw new Error('SOURCE_NOT_ALLOWED');
    if (!/^[a-f0-9]{64}$/i.test(item?.sha256 ?? '')) throw new Error('HASH_INVALID');
    if (!Number.isSafeInteger(item?.sizeBytes) || item.sizeBytes < 1) throw new Error('SIZE_INVALID');

    const targetDirectory = path.resolve(root);
    const finalPath = resolveInside(targetDirectory, fileName);
    const partialPath = resolveInside(targetDirectory, `${fileName}.partial`);
    const quarantineDirectory = resolveInside(targetDirectory, '.quarantine');
    await mkdir(targetDirectory, { recursive: true });
    await mkdir(quarantineDirectory, { recursive: true });
    if (await pathExists(finalPath)) throw new Error('TARGET_CONFLICT');

    const existingBytes = (await pathExists(partialPath)) ? (await stat(partialPath)).size : 0;
    if (existingBytes > item.sizeBytes) throw new Error('PARTIAL_SIZE_INVALID');
    const headers = existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : {};
    const response = await fetchImpl(item.sourceUrl, { method: 'GET', headers });
    if (!response || ![200, 206].includes(response.status)) throw new Error('DOWNLOAD_REQUEST_FAILED');
    if (existingBytes > 0 && response.status !== 206) throw new Error('RANGE_UNSUPPORTED');

    const hash = createHash('sha256');
    await hashExisting(partialPath, hash);
    const handle = await open(partialPath, existingBytes > 0 ? 'a' : 'w');
    let downloadedBytes;
    try {
      downloadedBytes = await writeResponseBody(response, handle, hash);
    } finally {
      await handle.close();
    }
    const totalBytes = existingBytes + downloadedBytes;
    if (totalBytes !== item.sizeBytes) throw new Error('SIZE_MISMATCH');
    const actualHash = hash.digest('hex');
    if (actualHash !== item.sha256.toLowerCase()) {
      const quarantinePath = resolveInside(quarantineDirectory, `${fileName}.${now().getTime()}.hash-mismatch.partial`);
      await rename(partialPath, quarantinePath);
      throw new Error('HASH_MISMATCH');
    }
    await rename(partialPath, finalPath);
    return Object.freeze({ finalPath, bytes: totalBytes, sha256: actualHash, resumedFromBytes: existingBytes });
  };
}
