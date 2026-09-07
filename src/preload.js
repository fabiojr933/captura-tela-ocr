const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startAreaCapture: (mode) => ipcRenderer.invoke('start-area-capture', mode),
  cropAndSave: (bounds) => ipcRenderer.invoke('crop-and-save', bounds),
  cancelCapture: () => ipcRenderer.invoke('cancel-capture'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  onInitOverlay: (callback) => ipcRenderer.on('init-overlay', (_event, data) => callback(data))
});