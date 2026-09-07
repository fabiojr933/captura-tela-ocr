const { app, BrowserWindow, ipcMain, desktopCapturer, screen, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');

let mainWindow = null;
let overlayWindow = null;
let fullScreenshotImage = null;
let capturePromiseResolve = null;
let currentCaptureMode = 'image'; // 'image' ou 'ocr'

// Obtém o diretório correto onde o executável está rodando (evita o erro ENOTDIR)
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
    width: 620,
    height: 680,
    maximizable: false,
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

ipcMain.handle('start-area-capture', async (_event, mode = 'image') => {
  currentCaptureMode = mode;

  return new Promise(async (resolve) => {
    capturePromiseResolve = resolve;

    try {
      if (!mainWindow) return resolve({ success: false, error: 'Janela principal não encontrada' });

      mainWindow.hide();
      await new Promise(r => setTimeout(r, 300));

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
        closeOverlayAndResolve({ success: false, error: 'Nenhuma tela encontrada.' });
        return;
      }

      fullScreenshotImage = sources[0].thumbnail;

      overlayWindow = new BrowserWindow({
        width: primaryDisplay.bounds.width,
        height: primaryDisplay.bounds.height,
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        fullscreen: true,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      await overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

      overlayWindow.webContents.send('init-overlay', {
        imageUri: fullScreenshotImage.toDataURL()
      });

    } catch (err) {
      console.error('Erro ao iniciar captura:', err);
      closeOverlayAndResolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('crop-and-save', async (_event, bounds) => {
  try {
    if (!fullScreenshotImage) {
      closeOverlayAndResolve({ success: false, error: 'Imagem base não encontrada.' });
      return;
    }

    const imgSize = fullScreenshotImage.getSize();
    const primaryDisplay = screen.getPrimaryDisplay();
    const displayBounds = primaryDisplay.bounds;

    const scaleX = imgSize.width / displayBounds.width;
    const scaleY = imgSize.height / displayBounds.height;

    let cropX = Math.round(bounds.x * scaleX);
    let cropY = Math.round(bounds.y * scaleY);
    let cropW = Math.round(bounds.width * scaleX);
    let cropH = Math.round(bounds.height * scaleY);

    cropX = Math.max(0, Math.min(cropX, imgSize.width - 1));
    cropY = Math.max(0, Math.min(cropY, imgSize.height - 1));
    cropW = Math.min(cropW, imgSize.width - cropX);
    cropH = Math.min(cropH, imgSize.height - cropY);

    if (cropW <= 10 || cropH <= 10) {
      closeOverlayAndResolve({ success: false, error: 'Área selecionada é muito pequena.' });
      return;
    }

    const croppedImage = fullScreenshotImage.crop({
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH
    });

    // Cria a pasta screenshots no diretório do executável
    const outputDir = path.join(getAppDirectory(), 'screenshots');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `print-area-${Date.now()}.png`;
    const filePath = path.resolve(outputDir, fileName);
    const imageBuffer = croppedImage.toPNG();
    fs.writeFileSync(filePath, imageBuffer);

    const dataUrl = croppedImage.toDataURL();

    if (currentCaptureMode === 'ocr') {
      const { data } = await Tesseract.recognize(imageBuffer, 'por+eng');
      const transcribedText = data && data.text ? data.text.trim() : '';

      if (transcribedText) {
        clipboard.writeText(transcribedText);
      }

      closeOverlayAndResolve({
        success: true,
        mode: 'ocr',
        text: transcribedText,
        fileName,
        filePath,
        dataUrl
      });
    } else {
      clipboard.writeImage(croppedImage);

      closeOverlayAndResolve({
        success: true,
        mode: 'image',
        fileName,
        filePath,
        dataUrl
      });
    }

  } catch (error) {
    console.error('Erro ao recortar/processar imagem:', error);
    closeOverlayAndResolve({ success: false, error: error.message });
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
  closeOverlayAndResolve({ cancelled: true });
});

function closeOverlayAndResolve(result) {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
  if (capturePromiseResolve) {
    capturePromiseResolve(result);
    capturePromiseResolve = null;
  }
}