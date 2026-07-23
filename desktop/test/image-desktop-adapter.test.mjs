import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createImageDesktopAdapter, createProgressPayload, createReferenceHandleStore, readImagePreview, readImageThumbnail, selectReferenceFile } from '../src/image-desktop-adapter.mjs';

test('maps a fixed desktop action to exactly one injected backend handler', async () => {
  const adapter = createImageDesktopAdapter({ handlers: { startJob: async (generation) => ({ jobId: generation.jobId }) } });
  assert.deepEqual(await adapter.dispatch({ type: 'image:job:start', payload: { generation: { jobId: 'job-1' } } }), { jobId: 'job-1' });
  await assert.rejects(() => adapter.dispatch({ type: 'image:job:stop', payload: { jobId: 'job-1' } }), /IMAGE_BACKEND_NOT_CONNECTED/);
});

test('opens a single filtered native dialog result and exposes only an opaque handle', async () => {
  const handles = createReferenceHandleStore({ randomId: () => 'handle-1' });
  const selected = await selectReferenceFile({ dialog: { showOpenDialog: async (_window, options) => { assert.deepEqual(options.filters[0].extensions, ['png', 'jpg', 'jpeg', 'webp']); return { canceled: false, filePaths: ['D:/images/ref.webp'] }; } }, browserWindow: {}, referenceHandles: handles });
  assert.deepEqual(selected, { referenceId: 'ref_handle1', displayName: 'ref.webp' }); assert.equal(handles.resolve(selected.referenceId), path.resolve('D:/images/ref.webp'));
  assert.equal(await selectReferenceFile({ dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }, referenceHandles: handles }), null);
  await assert.rejects(() => selectReferenceFile({ dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['D:/images/ref.exe'] }) }, referenceHandles: handles }), /REFERENCE_FILE_TYPE_NOT_ALLOWED/);
});

test('reads only a bounded non-link image preview without exposing the file path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-preview-')); const image = path.join(root, 'draft.png');
  try {
    await writeFile(image, Buffer.from([137, 80, 78, 71]));
    assert.deepEqual(await readImagePreview({ filePath: image, maxBytes: 10 }), { mimeType: 'image/png', base64: 'iVBORw==' });
    await assert.rejects(() => readImagePreview({ filePath: image, maxBytes: 3 }), /PREVIEW_FILE_TOO_LARGE/);
    await assert.rejects(() => readImagePreview({ filePath: path.join(root, 'draft.txt') }), /PREVIEW_FILE_TYPE_NOT_ALLOWED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('returns a bounded PNG thumbnail rather than a full original image payload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-thumbnail-')); const image = path.join(root, 'draft.png');
  try {
    await writeFile(image, Buffer.from([137, 80, 78, 71]));
    const preview = await readImageThumbnail({
      filePath: image,
      imageFactory: () => ({ isEmpty: () => false, getSize: () => ({ width: 1600, height: 800 }), resize: ({ width, height }) => ({ toPNG: () => Buffer.from(`${width}x${height}`) }), toPNG: () => Buffer.from('original') }),
    });
    assert.equal(preview.mimeType, 'image/png');
    assert.equal(Buffer.from(preview.base64, 'base64').toString(), '512x256');
    assert.equal(preview.thumbnail, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('allows only bounded operation progress payloads', () => {
  assert.deepEqual(createProgressPayload({ kind: 'generation', operationId: 'job_1', state: 'running', percent: 50, message: '生成第 1 轮' }), { kind: 'generation', operationId: 'job_1', state: 'running', percent: 50, message: '生成第 1 轮' });
  assert.throws(() => createProgressPayload({ kind: 'generation', operationId: '../bad', state: 'running', percent: 50 }), /PROGRESS_PAYLOAD_INVALID/);
});
