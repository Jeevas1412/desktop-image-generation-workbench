import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createArtifactDownloader } from '../src/image/artifact-downloader.mjs';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function response(status, body) { return new Response(body, { status }); }
function itemFor(content, overrides = {}) {
  return { targetDirectoryId: 'comfy.checkpoints', expectedFileName: 'model.safetensors', sourceUrl: 'https://example.invalid/model', sha256: sha256(content), sizeBytes: Buffer.byteLength(content), ...overrides };
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgx-image-download-test-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('downloads into a partial file, verifies the hash, then atomically publishes the final name', async () => {
  await withTemporaryDirectory(async (directory) => {
    const downloader = createArtifactDownloader({ targetRoots: { 'comfy.checkpoints': directory }, fetchImpl: async () => response(200, 'verified-content') });
    const result = await downloader(itemFor('verified-content'));
    assert.equal(result.resumedFromBytes, 0);
    assert.equal(await readFile(path.join(directory, 'model.safetensors'), 'utf8'), 'verified-content');
    await assert.rejects(readFile(path.join(directory, 'model.safetensors.partial')), /ENOENT/);
  });
});

test('resumes an existing partial using Range without duplicating bytes', async () => {
  await withTemporaryDirectory(async (directory) => {
    await writeFile(path.join(directory, 'model.safetensors.partial'), 'hello ');
    let observedHeaders;
    const downloader = createArtifactDownloader({
      targetRoots: { 'comfy.checkpoints': directory },
      fetchImpl: async (_url, init) => { observedHeaders = init.headers; return response(206, 'world'); },
    });
    const result = await downloader(itemFor('hello world'));
    assert.equal(result.resumedFromBytes, 6);
    assert.deepEqual(observedHeaders, { Range: 'bytes=6-' });
    assert.equal(await readFile(path.join(directory, 'model.safetensors'), 'utf8'), 'hello world');
  });
});

test('quarantines a hash mismatch and blocks unsafe paths, duplicate final files, and non-Range responses', async () => {
  await withTemporaryDirectory(async (directory) => {
    const downloader = createArtifactDownloader({ targetRoots: { 'comfy.checkpoints': directory }, fetchImpl: async () => response(200, 'wrong') , now: () => new Date('2026-07-20T15:00:00.000Z') });
    await assert.rejects(() => downloader(itemFor('right')), /HASH_MISMATCH/);
    const quarantine = path.join(directory, '.quarantine', 'model.safetensors.1784559600000.hash-mismatch.partial');
    assert.equal(await readFile(quarantine, 'utf8'), 'wrong');
    await assert.rejects(() => downloader(itemFor('x', { expectedFileName: '../escape.safetensors' })), /INVALID_FILE_NAME/);
    await writeFile(path.join(directory, 'model.safetensors'), 'occupied');
    await assert.rejects(() => downloader(itemFor('right')), /TARGET_CONFLICT/);
  });
  await withTemporaryDirectory(async (directory) => {
    await writeFile(path.join(directory, 'model.safetensors.partial'), 'start');
    const downloader = createArtifactDownloader({ targetRoots: { 'comfy.checkpoints': directory }, fetchImpl: async () => response(200, 'again') });
    await assert.rejects(() => downloader(itemFor('startagain')), /RANGE_UNSUPPORTED/);
  });
});
