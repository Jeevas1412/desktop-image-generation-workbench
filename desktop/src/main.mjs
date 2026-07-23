import { app, BrowserWindow, dialog, ipcMain, Menu, Tray, nativeImage } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createImageIpcDispatcher } from './ipc-contract.mjs';
import { createImageDesktopAdapter, createReferenceHandleStore, readImageThumbnail, selectReferenceFile } from './image-desktop-adapter.mjs';
import { createCoreHandlers, createDesktopImageUseCases } from './backend-composition.mjs';
import { createTrayController } from './tray-controller.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDirectory, '../..');
const frontendIndex = join(app.isPackaged ? process.resourcesPath : projectRoot, 'frontend', 'dist', 'index.html');
let mainWindow;
let trayController;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function trustedSender(event) {
  // Compare against Electron's actual loaded URL, not a hand-constructed file
  // URL. The latter is vulnerable to harmless encoding/normalization
  // differences on Windows and can reject our own packaged renderer.
  const contents = mainWindow?.webContents;
  const senderUrl = event.senderFrame?.url;
  return Boolean(contents && event.sender === contents && senderUrl === contents.getURL() && senderUrl.startsWith('file:'));
}
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 1080, minHeight: 720, webPreferences: { preload: join(moduleDirectory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.on('close', (event) => {
    if (trayController?.shouldHideOnClose()) {
      event.preventDefault();
      trayController.hideMainWindow();
    }
  });
  mainWindow.on('closed', () => { mainWindow = undefined; });
  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(frontendIndex);
  return mainWindow;
}

async function importBackendModule(name) {
  const root = app.isPackaged ? join(process.resourcesPath, 'backend', 'src', 'image') : join(projectRoot, 'backend', 'src', 'image');
  return import(pathToFileURL(join(root, name)).href);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  const referenceHandles = createReferenceHandleStore();
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  });
  const [{ createImageApplicationCore }, libraryStore, { createLibraryReviewStore }, { createComfyUiConnectionVerifier }, { createComfyUiProfileStore }, { createComfyUiReadonlyScan }, { createModelSelectionStore }, { inspectRegisteredCore }, { createJobHistoryStore }, { createRealGenerationService }, { createVlmTranslationService }, { createVlmReviewService }, { createVlmProfileStore }, { createVlmConnectionVerifier }] = await Promise.all([
    importBackendModule('application-core.mjs'),
    importBackendModule('library-store.mjs'),
    importBackendModule('library-review-store.mjs'),
    importBackendModule('comfyui-connection-verifier.mjs'),
    importBackendModule('comfyui-profile-store.mjs'),
    importBackendModule('comfyui-readonly-scan.mjs'),
    importBackendModule('model-selection-store.mjs'),
    importBackendModule('core-model-registry.mjs'),
    importBackendModule('job-history-store.mjs'),
    importBackendModule('real-generation-service.mjs'),
    importBackendModule('vlm-translation-service.mjs'),
    importBackendModule('vlm-review-service.mjs'),
    importBackendModule('vlm-profile-store.mjs'),
    importBackendModule('vlm-connection-verifier.mjs'),
  ]);
  const userDataRoot = app.getPath('userData');
  const libraryRoot = join(userDataRoot, 'semifinished');
  const libraryReviewStore = createLibraryReviewStore({ userDataRoot });
  const comfyUiConnectionVerifier = createComfyUiConnectionVerifier();
  const comfyUiProfileStore = createComfyUiProfileStore({ userDataRoot });
  const comfyUiReadonlyScan = createComfyUiReadonlyScan({ verifier: comfyUiConnectionVerifier });
  const vlmProfileStore = createVlmProfileStore({ userDataRoot });
  const vlmConnectionVerifier = createVlmConnectionVerifier();
  const vlmReviewService = createVlmReviewService({ profileStore: vlmProfileStore, connectionVerifier: vlmConnectionVerifier });
  const modelSelectionStore = createModelSelectionStore({ userDataRoot });
  const jobHistoryStore = createJobHistoryStore({ userDataRoot });
  const realGenerationService = createRealGenerationService({
    profileStore: comfyUiProfileStore,
    modelSelectionStore,
    readonlyScan: comfyUiReadonlyScan,
    referenceHandles,
    outputRoot: join(userDataRoot, 'generated'),
    libraryRoot,
    jobHistoryStore,
    libraryReviewStore,
    reviewService: vlmReviewService,
  });
  await realGenerationService.recover();
  const vlmTranslationService = createVlmTranslationService({ profileStore: vlmProfileStore, connectionVerifier: vlmConnectionVerifier });
  const backendCore = createImageApplicationCore({ useCases: createDesktopImageUseCases({ userDataRoot, libraryStore, libraryReviewStore, comfyUiConnectionVerifier, comfyUiProfileStore, comfyUiReadonlyScan, vlmConnectionVerifier, vlmProfileStore, modelSelectionStore, realGenerationService, vlmTranslationService, vlmReviewService, coreRegistry: { inspectRegisteredCore } }) });
  const backendAdapter = createImageDesktopAdapter({ handlers: createCoreHandlers(backendCore, { referenceHandles }) });
  const dispatcher = createImageIpcDispatcher({ dispatch: backendAdapter.dispatch });
  ipcMain.handle('image-workbench:request', (event, request) => { if (!trustedSender(event)) throw new Error('IPC_UNTRUSTED_SENDER'); return dispatcher.request(request); });
  ipcMain.handle('image-workbench:pick-reference', (event) => { if (!trustedSender(event)) throw new Error('IPC_UNTRUSTED_SENDER'); return selectReferenceFile({ dialog, browserWindow: mainWindow, referenceHandles }); });
  ipcMain.handle('image-workbench:preview-reference', async (event, referenceId) => {
    if (!trustedSender(event)) throw new Error('IPC_UNTRUSTED_SENDER');
    if (typeof referenceId !== 'string' || !/^ref_[A-Za-z0-9_-]+$/.test(referenceId)) throw new Error('IPC_REFERENCE_ID_INVALID');
    return readImageThumbnail({ filePath: referenceHandles.resolve(referenceId), imageFactory: nativeImage.createFromPath });
  });
  ipcMain.handle('image-workbench:preview-library-item', async (event, libraryItemId) => {
    if (!trustedSender(event)) throw new Error('IPC_UNTRUSTED_SENDER');
    if (typeof libraryItemId !== 'string' || libraryItemId.includes('..') || /[\\/]/.test(libraryItemId)) throw new Error('IPC_LIBRARY_ITEM_ID_INVALID');
    return readImageThumbnail({ filePath: await libraryStore.selectReference({ libraryRoot, libraryItemId }), imageFactory: nativeImage.createFromPath });
  });
  trayController = createTrayController({
    app,
    Menu,
    Tray,
    iconPath: join(app.getAppPath(), 'build', 'icon.ico'),
    getMainWindow: () => mainWindow,
    createWindow,
  });
  trayController.install();
  createWindow();
});
app.on('activate', () => { showMainWindow(); });
app.on('window-all-closed', () => { if (!trayController && process.platform !== 'darwin') app.quit(); });
