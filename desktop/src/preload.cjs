const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('imageWorkbench', Object.freeze({
  request: (request) => ipcRenderer.invoke('image-workbench:request', request),
  pickReference: () => ipcRenderer.invoke('image-workbench:pick-reference'),
  previewReference: (referenceId) => ipcRenderer.invoke('image-workbench:preview-reference', referenceId),
  previewLibraryItem: (libraryItemId) => ipcRenderer.invoke('image-workbench:preview-library-item', libraryItemId),
  onProgress: (listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function.');
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('image-workbench:progress', wrapped);
    return () => ipcRenderer.removeListener('image-workbench:progress', wrapped);
  },
}));
