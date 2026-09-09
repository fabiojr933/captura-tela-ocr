const { app, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const Tesseract = require('tesseract.js');

let mainWindow = null;
let overlayWindow = null;
let fullScreenshotImage = null;
let currentCaptureMode = 'image';

function getAppDirectory() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  return app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.join(__dirname, '..');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 560,
    maximizable: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ==========================================================================
   CONTROLE DE REDIMENSIONAMENTO DA JANELA (MODO EDITOR)
   ========================================================================== */

ipcMain.on('resize-for-editor', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.maximize();
  }
});

ipcMain.on('reset-from-editor', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.unmaximize();
    mainWindow.setSize(580, 560);
    mainWindow.center();
  }
});

/* ==========================================================================
   FLUXO DE CAPTURA DE TELA E OVERLAY (CORRIGIDO)
   ========================================================================== */

ipcMain.handle('start-area-capture', async (_event, mode = 'image') => {
  currentCaptureMode = mode;

  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Janela principal não encontrada.' };
    }

    // 1. Minimiza a janela (evita deadlock de opacidade/compositor do Windows)
    mainWindow.minimize();

    // 2. Aguarda o SO atualizar os frames na tela
    await new Promise(r => setTimeout(r, 300));

    // 3. Captura o monitor principal
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scale = primaryDisplay.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
      }
    });

    if (!sources || sources.length === 0) {
      closeOverlayAndShowMain();
      return { success: false, error: 'Nenhuma tela encontrada.' };
    }

    fullScreenshotImage = sources[0].thumbnail;

    // Se já houver um overlay antigo aberto, destrói
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
      overlayWindow = null;
    }

    // 4. Instancia a janela do Overlay com configurações seguras para Windows
    overlayWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');

    // Oculta a janela principal do mapa do Windows totalmente agora que a imagem já está capturada
    mainWindow.hide();

    // 5. Exibe o overlay e envia o buffer Base64
    overlayWindow.webContents.once('did-finish-load', () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.focus();
        overlayWindow.webContents.send('init-overlay', {
          imageUri: fullScreenshotImage.toDataURL()
        });
      }
    });

    await overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
    return { success: true };

  } catch (err) {
    console.error('Erro no start-area-capture:', err);
    closeOverlayAndShowMain();
    return { success: false, error: err.message };
  }
});

ipcMain.handle('crop-and-save', async (event, bounds) => {
  try {
    if (!fullScreenshotImage) {
      throw new Error('Nenhuma captura disponível para recortar.');
    }

    const { x, y, width, height } = bounds || {};
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error('Área de recorte inválida.');
    }

    const croppedImage = fullScreenshotImage.crop({ x, y, width, height });
    const outputDir = path.join(getAppDirectory(), 'screenshots');
    fs.mkdirSync(outputDir, { recursive: true });
    const savedFilePath = path.join(outputDir, `print-${Date.now()}.png`);
    fs.writeFileSync(savedFilePath, croppedImage.toPNG());
    clipboard.writeImage(croppedImage);

    const fileUri = pathToFileURL(savedFilePath).href;
    const dataUrl = croppedImage.toDataURL();
    let text = null;

    if (currentCaptureMode === 'ocr') {
      const recognition = await Tesseract.recognize(dataUrl, 'por+eng');
      text = recognition.data.text.trim();
      clipboard.writeText(text);
    }

    closeOverlayAndShowMain();

    // 3. Notifica a janela principal com os dados do arquivo gerado
    if (mainWindow) {
      mainWindow.webContents.send('capture-complete', {
        filePath: savedFilePath,
        fileUri,
        dataUrl,
        mode: currentCaptureMode,
        text
      });
    }

    return { success: true, filePath: savedFilePath, fileUri, dataUrl, mode: currentCaptureMode, text };
  } catch (error) {
    console.error('Erro ao recortar imagem:', error);
    closeOverlayAndShowMain();
    return { success: false, error: error.message };
  }
});

/* ==========================================================================
   HANDLERS AUXILIARES
   ========================================================================== */

ipcMain.handle('save-edited-image', async (_event, { dataUrl, filePath }) => {
  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, 'base64');

    let targetPath = filePath;
    if (!targetPath) {
      const outputDir = path.join(getAppDirectory(), 'screenshots');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      targetPath = path.join(outputDir, `print-edited-${Date.now()}.png`);
    }

    fs.writeFileSync(targetPath, imageBuffer);

    const nativeImg = nativeImage.createFromBuffer(imageBuffer);
    clipboard.writeImage(nativeImg);

    return { success: true, filePath: targetPath };
  } catch (err) {
    console.error('Erro ao salvar imagem editada:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-text', (_event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
    return true;
  }
  return false;
});

ipcMain.handle('open-file', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath);
  }
});

ipcMain.handle('cancel-capture', () => {
  closeOverlayAndShowMain();
  return { cancelled: true };
});

function closeOverlayAndShowMain() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}