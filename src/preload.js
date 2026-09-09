const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Controle de janela e editor
  resizeForEditor: () => ipcRenderer.send('resize-for-editor'),
  resetFromEditor: () => ipcRenderer.send('reset-from-editor'),
  saveEditedImage: (data) => ipcRenderer.invoke('save-edited-image', data),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  startAreaCapture: (mode) => ipcRenderer.invoke('start-area-capture', mode),

  // Eventos do Overlay (Seleção de área)
  onInitOverlay: (callback) => ipcRenderer.on('init-overlay', (_event, value) => callback(value)),
  cropAndSave: (bounds) => ipcRenderer.invoke('crop-and-save', bounds),
  cancelCapture: () => ipcRenderer.send('cancel-capture'),

  // Eventos para a Janela Principal (Notificação do fim da captura)
  onCaptureComplete: (callback) => ipcRenderer.on('capture-complete', (_event, value) => callback(value))
});