import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const IMAGE_MIME_TYPES = Object.freeze({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' });
const ACTION_TO_HANDLER = Object.freeze({
  'image:capabilities:get': ['capabilities', () => undefined], 'model:install:plan': ['planInstall', (payload) => payload.capabilityId], 'model:install:confirm': ['confirmInstall', (payload) => payload.planId],
  'image:job:start': ['startJob', (payload) => payload.generation], 'image:job:get': ['getJob', (payload) => payload.jobId], 'image:job:stop': ['stopJob', (payload) => payload.jobId],
  'image:jobs:list': ['listJobs', () => undefined],
  'prompt:translate': ['translatePrompt', (payload) => payload.text],
  'library:list': ['listLibrary', (payload) => payload.kind], 'library:review': ['reviewLibraryItem', (payload) => payload.libraryItemId], 'library:reference:select': ['selectReference', (payload) => payload.libraryItemId],
  'library:semifinished:clear:plan': ['createSemifinishedCleanupPlan', () => undefined], 'library:semifinished:clear:confirm': ['confirmSemifinishedCleanup', (payload) => payload.planId],
  'comfyui:connection:verify': ['verifyComfyUiConnection', (payload) => payload.profile],
  'comfyui:status:check': ['checkComfyUiStatus', () => undefined],
  'comfyui:profile:get': ['getComfyUiProfile', () => undefined], 'comfyui:profile:save': ['saveComfyUiProfile', (payload) => payload.profile],
  'vlm:connection:verify': ['verifyVlmConnection', (payload) => payload.profile], 'vlm:profile:get': ['getVlmProfile', () => undefined], 'vlm:profile:save': ['saveVlmProfile', (payload) => payload.profile],
  'comfyui:readonly:scan': ['scanComfyUiReadonly', () => undefined],
  'model:selection:get': ['getModelSelection', () => undefined], 'model:selection:save': ['saveModelSelection', (payload) => payload.selection],
});

export function createReferenceHandleStore({ randomId = randomUUID } = {}) {
  const handles = new Map();
  return Object.freeze({
    register(filePath) {
      const absolutePath = path.resolve(String(filePath ?? ''));
      const referenceId = `ref_${randomId().replace(/-/g, '')}`;
      handles.set(referenceId, absolutePath);
      return Object.freeze({ referenceId, displayName: path.basename(absolutePath) });
    },
    resolve(referenceId) {
      const filePath = handles.get(referenceId);
      if (!filePath) throw new Error('REFERENCE_HANDLE_NOT_FOUND');
      return filePath;
    },
    revoke(referenceId) { handles.delete(referenceId); },
  });
}

export function createImageDesktopAdapter({ handlers = {} } = {}) {
  return Object.freeze({
    async dispatch(request) {
      const target = ACTION_TO_HANDLER[request.type]; const [name, argument] = target ?? [];
      const handler = handlers[name];
      if (typeof handler !== 'function') throw new Error('IMAGE_BACKEND_NOT_CONNECTED');
      return handler(argument(request.payload));
    },
  });
}

export async function selectReferenceFile({ dialog, browserWindow, referenceHandles }) {
  if (!dialog || typeof dialog.showOpenDialog !== 'function') throw new Error('DIALOG_UNAVAILABLE');
  const result = await dialog.showOpenDialog(browserWindow, { title: '选择参考图', properties: ['openFile'], filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) return null;
  const selected = result.filePaths[0]; const extension = path.extname(selected).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('REFERENCE_FILE_TYPE_NOT_ALLOWED');
  if (!referenceHandles || typeof referenceHandles.register !== 'function') throw new Error('REFERENCE_HANDLE_STORE_REQUIRED');
  return referenceHandles.register(selected);
}

export async function readImagePreview({ filePath, maxBytes = 16 * 1024 * 1024 } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('PREVIEW_FILE_TYPE_NOT_ALLOWED');
  const absolute = path.resolve(filePath);
  const extension = path.extname(absolute).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('PREVIEW_FILE_TYPE_NOT_ALLOWED');
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('PREVIEW_LIMIT_INVALID');
  const info = await lstat(absolute).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error('PREVIEW_FILE_NOT_ALLOWED');
  if (info.size > maxBytes) throw new Error('PREVIEW_FILE_TOO_LARGE');
  return Object.freeze({ mimeType: IMAGE_MIME_TYPES[extension], base64: (await readFile(absolute)).toString('base64') });
}

export async function readImageThumbnail({ filePath, imageFactory, maxBytes = 32 * 1024 * 1024, maxDimension = 512 } = {}) {
  if (typeof imageFactory !== 'function') throw new Error('PREVIEW_IMAGE_FACTORY_REQUIRED');
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('PREVIEW_FILE_TYPE_NOT_ALLOWED');
  const absolute = path.resolve(filePath);
  const extension = path.extname(absolute).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('PREVIEW_FILE_TYPE_NOT_ALLOWED');
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(maxDimension) || maxDimension < 64 || maxDimension > 1024) throw new Error('PREVIEW_LIMIT_INVALID');
  const info = await lstat(absolute).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error('PREVIEW_FILE_NOT_ALLOWED');
  if (info.size > maxBytes) throw new Error('PREVIEW_FILE_TOO_LARGE');
  const image = imageFactory(absolute);
  if (!image || typeof image.isEmpty !== 'function' || typeof image.resize !== 'function' || typeof image.toPNG !== 'function' || image.isEmpty()) throw new Error('PREVIEW_IMAGE_DECODE_FAILED');
  const size = typeof image.getSize === 'function' ? image.getSize() : {};
  const width = Number(size.width) || maxDimension;
  const height = Number(size.height) || maxDimension;
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  const thumbnail = image.resize({ width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), quality: 'good' });
  return Object.freeze({ mimeType: 'image/png', base64: Buffer.from(thumbnail.toPNG()).toString('base64'), thumbnail: true, sourceBytes: info.size });
}

export function createProgressPayload({ kind, operationId, state, percent, message = '' } = {}) {
  if (!['download', 'generation'].includes(kind) || typeof operationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(operationId) || !['queued', 'running', 'completed', 'failed', 'cancelled'].includes(state) || !Number.isFinite(percent) || percent < 0 || percent > 100 || typeof message !== 'string' || message.length > 300) throw new Error('PROGRESS_PAYLOAD_INVALID');
  return Object.freeze({ kind, operationId, state, percent, message });
}
