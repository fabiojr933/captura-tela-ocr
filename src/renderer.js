let currentCaptureData = null;

// Elementos da Interface Principal
const btnCaptureImg = document.getElementById('btn-capture-img');
const btnCaptureOcr = document.getElementById('btn-capture-ocr');
const statusDiv = document.getElementById('status');
const textContainer = document.getElementById('text-container');
const ocrTextarea = document.getElementById('ocr-textarea');
const btnCopyText = document.getElementById('btn-copy-text');
const btnCopyLabel = document.getElementById('btn-copy-label');
const previewContainer = document.getElementById('preview-container');
const previewImg = document.getElementById('preview-img');
const previewWrapper = document.getElementById('preview-wrapper');

// Elementos do Modal Editor
const btnEditImage = document.getElementById('btn-edit-image');
const editorModal = document.getElementById('editor-modal');
const editorCanvas = document.getElementById('editor-canvas');
const ctx = editorCanvas ? editorCanvas.getContext('2d') : null;
const editorColor = document.getElementById('editor-color');
const lineWidthInput = document.getElementById('line-width');
const lineWidthLabel = document.getElementById('line-width-label');
const btnEditorUndo = document.getElementById('btn-editor-undo');
const btnEditorClear = document.getElementById('btn-editor-clear');
const btnEditorClose = document.getElementById('btn-editor-close');
const btnEditorSave = document.getElementById('btn-editor-save');
const editorWorkspace = document.getElementById('editor-workspace');
const textInputOverlay = document.getElementById('text-input-overlay');

/* ==========================================================================
   FLUXOS DE CAPTURA E EVENTOS PRINCIPAIS
   ========================================================================== */

if (btnCaptureImg) btnCaptureImg.addEventListener('click', () => handleCapture('image'));
if (btnCaptureOcr) btnCaptureOcr.addEventListener('click', () => handleCapture('ocr'));

if (window.electronAPI && window.electronAPI.onCaptureComplete) {
  window.electronAPI.onCaptureComplete((capture) => {
    currentCaptureData = capture;
    if (capture.mode === 'ocr') {
      if (previewContainer) previewContainer.classList.add('hidden');
      if (textContainer) textContainer.classList.remove('hidden');
      if (ocrTextarea) ocrTextarea.value = capture.text || 'Nenhum texto identificado.';
      showStatus('Texto extraído e copiado!', 'success');
    } else {
      if (textContainer) textContainer.classList.add('hidden');
      if (previewContainer) previewContainer.classList.remove('hidden');
      if (previewImg) previewImg.src = capture.dataUrl || capture.fileUri;
      showStatus('Imagem capturada e copiada!', 'success');
    }
  });
}

async function handleCapture(mode) {
  showStatus('Iniciando captura...', 'info');
  try {
    const result = await window.electronAPI.startAreaCapture(mode);

    if (!result || result.cancelled) {
      hideStatus();
      return;
    }

    if (!result.success) {
      showStatus(`Erro: ${result.error}`, 'error');
      return;
    }

    currentCaptureData = result;

    if (mode === 'ocr') {
      if (previewContainer) previewContainer.classList.add('hidden');
      if (textContainer) textContainer.classList.remove('hidden');
      if (ocrTextarea) ocrTextarea.value = result.text || 'Nenhum texto identificado.';
      showStatus('Texto extraído e copiado!', 'success');
    } else {
      if (textContainer) textContainer.classList.add('hidden');
      if (previewContainer) previewContainer.classList.remove('hidden');
      if (previewImg) previewImg.src = result.dataUrl;
      showStatus('Imagem capturada e copiada!', 'success');
    }
  } catch (err) {
    showStatus(`Erro ao capturar: ${err.message}`, 'error');
  }
}

if (previewWrapper) {
  previewWrapper.addEventListener('click', () => {
    if (currentCaptureData && currentCaptureData.filePath) {
      window.electronAPI.openFile(currentCaptureData.filePath);
    }
  });
}

if (btnCopyText) {
  btnCopyText.addEventListener('click', async () => {
    if (ocrTextarea && ocrTextarea.value) {
      await window.electronAPI.copyText(ocrTextarea.value);
      if (btnCopyLabel) btnCopyLabel.textContent = 'Copiado!';
      setTimeout(() => { 
        if (btnCopyLabel) btnCopyLabel.textContent = 'Copiar Texto'; 
      }, 2000);
    }
  });
}

function showStatus(message, type) {
  if (!statusDiv) return;
  statusDiv.classList.remove(
    'hidden', 
    'bg-red-500/10', 'border-red-500/20', 'text-red-400', 
    'bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-400', 
    'bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-400'
  );
  
  if (type === 'error') {
    statusDiv.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
  } else if (type === 'success') {
    statusDiv.classList.add('bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-400');
  } else {
    statusDiv.classList.add('bg-indigo-500/10', 'border-indigo-500/20', 'text-indigo-400');
  }
  
  statusDiv.textContent = message;
}

function hideStatus() {
  if (statusDiv) statusDiv.classList.add('hidden');
}

/* ==========================================================================
   SISTEMA DE EDIÇÃO CANVAS 2D + REDIMENSIONAMENTO DE JANELA
   ========================================================================== */

let isDrawing = false;
let currentTool = 'pen';
let startX = 0, startY = 0;
let baseImage = null;
let historyStack = [];
let highlighterBaseState = null;
let highlighterPoints = [];

if (btnEditImage) {
  btnEditImage.addEventListener('click', () => {
    if (!currentCaptureData || !currentCaptureData.dataUrl) return;
    openEditor(currentCaptureData.dataUrl);
  });
}

function openEditor(dataUrl) {
  if (!editorCanvas || !ctx) return;

  if (window.electronAPI && window.electronAPI.resizeForEditor) {
    window.electronAPI.resizeForEditor();
  }

  baseImage = new Image();
  baseImage.onload = () => {
    editorCanvas.width = baseImage.width;
    editorCanvas.height = baseImage.height;
    ctx.drawImage(baseImage, 0, 0);
    
    historyStack = [];
    saveHistoryState();

    if (editorModal) editorModal.classList.remove('hidden');
    setActiveTool('pen');
  };
  baseImage.src = dataUrl;
}

function closeEditor() {
  cancelTextInput();
  if (editorModal) editorModal.classList.add('hidden');
  
  if (window.electronAPI && window.electronAPI.resetFromEditor) {
    window.electronAPI.resetFromEditor();
  }
}

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const targetTool = e.currentTarget.getAttribute('data-tool');
    setActiveTool(targetTool);
  });
});

function setActiveTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.getAttribute('data-tool') === tool) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (tool === 'highlighter') {
    if (lineWidthInput) lineWidthInput.value = 20;
    if (lineWidthLabel) lineWidthLabel.textContent = '20px';
    if (editorColor) editorColor.value = '#fff200';
  } else if (tool === 'pen' || tool === 'arrow') {
    if (lineWidthInput) lineWidthInput.value = 3;
    if (lineWidthLabel) lineWidthLabel.textContent = '3px';
  }
}

document.querySelectorAll('#color-presets button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const color = e.currentTarget.getAttribute('data-color');
    if (editorColor) editorColor.value = color;
  });
});

if (lineWidthInput && lineWidthLabel) {
  lineWidthInput.addEventListener('input', (e) => {
    lineWidthLabel.textContent = `${e.target.value}px`;
  });
}

function saveHistoryState() {
  if (!ctx || !editorCanvas) return;
  if (historyStack.length > 20) historyStack.shift();
  historyStack.push(ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height));
}

function restoreLastHistoryState() {
  if (!ctx || historyStack.length <= 1) return;
  historyStack.pop();
  const previousState = historyStack[historyStack.length - 1];
  ctx.putImageData(previousState, 0, 0);
}

if (btnEditorUndo) btnEditorUndo.addEventListener('click', restoreLastHistoryState);

if (btnEditorClear) {
  btnEditorClear.addEventListener('click', () => {
    if (baseImage && ctx && editorCanvas) {
      ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
      ctx.drawImage(baseImage, 0, 0);
      historyStack = [];
      saveHistoryState();
    }
  });
}

if (btnEditorClose) btnEditorClose.addEventListener('click', closeEditor);

if (editorCanvas && ctx) {
  
  editorCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    editorCanvas.setPointerCapture(e.pointerId);
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;

    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;

    if (currentTool === 'text') {
      showTextInput(e.clientX, e.clientY, startX, startY);
      if (editorCanvas.hasPointerCapture(e.pointerId)) {
        editorCanvas.releasePointerCapture(e.pointerId);
      }
      return;
    }

    isDrawing = true;

    if (currentTool === 'pen' || currentTool === 'highlighter') {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      if (currentTool === 'highlighter') {
        highlighterBaseState = ctx.getImageData(0, 0, editorCanvas.width, editorCanvas.height);
        highlighterPoints = [{ x: startX, y: startY }];
      }
    }
  });

  editorCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;

    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    const selectedColor = editorColor ? editorColor.value : '#ef4444';
    const width = parseInt(lineWidthInput ? lineWidthInput.value : 3) || 3;

    if (currentTool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
    } else if (currentTool === 'highlighter') {
      highlighterPoints.push({ x: currentX, y: currentY });
      ctx.putImageData(highlighterBaseState, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#fff200';
      ctx.lineWidth = width;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'miter';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(highlighterPoints[0].x, highlighterPoints[0].y);
      highlighterPoints.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.stroke();
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentTool === 'rect' || currentTool === 'arrow') {
      const currentState = historyStack[historyStack.length - 1];
      ctx.putImageData(currentState, 0, 0);

      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = selectedColor;
      ctx.fillStyle = selectedColor;
      ctx.lineWidth = width;
      ctx.globalAlpha = 1.0;

      if (currentTool === 'rect') {
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
      } else if (currentTool === 'arrow') {
        drawArrow(ctx, startX, startY, currentX, currentY, width);
      }
    }
  });

  editorCanvas.addEventListener('pointerup', (e) => {
    if (isDrawing) {
      isDrawing = false;
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      highlighterBaseState = null;
      highlighterPoints = [];
      saveHistoryState();
    }
    if (editorCanvas.hasPointerCapture(e.pointerId)) {
      editorCanvas.releasePointerCapture(e.pointerId);
    }
  });

  editorCanvas.addEventListener('pointercancel', () => {
    if (isDrawing) {
      isDrawing = false;
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      highlighterBaseState = null;
      highlighterPoints = [];
      saveHistoryState();
    }
  });
}

function drawArrow(context, fromX, fromY, toX, toY, width) {
  const headlen = width * 4 + 6;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);

  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();

  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
  context.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  context.lineTo(toX, toY);
  context.fill();
}

function showTextInput(clientX, clientY, x, y) {
  if (!textInputOverlay || !editorWorkspace) return;
  const workspaceRect = editorWorkspace.getBoundingClientRect();
  textInputOverlay.style.left = `${clientX - workspaceRect.left}px`;
  textInputOverlay.style.top = `${clientY - workspaceRect.top}px`;
  textInputOverlay.style.display = 'block';
  textInputOverlay.value = '';
  textInputOverlay.dataset.x = `${x}`;
  textInputOverlay.dataset.y = `${y}`;
  textInputOverlay.focus();
}

function commitTextInput() {
  if (!textInputOverlay || textInputOverlay.style.display === 'none') return;
  const text = textInputOverlay.value.trim();
  const x = Number(textInputOverlay.dataset.x);
  const y = Number(textInputOverlay.dataset.y);
  textInputOverlay.style.display = 'none';
  textInputOverlay.blur();

  if (!text) return;
  const selectedColor = editorColor ? editorColor.value : '#ef4444';
  const fontSize = Math.max(16, parseInt(lineWidthInput ? lineWidthInput.value : 3) * 5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = selectedColor;
  ctx.globalAlpha = 1.0;
  ctx.fillText(text, x, y);
  saveHistoryState();
}

function cancelTextInput() {
  if (!textInputOverlay) return;
  textInputOverlay.style.display = 'none';
  textInputOverlay.value = '';
  textInputOverlay.blur();
}

if (textInputOverlay) {
  textInputOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTextInput();
    }
  });
}

if (btnEditorSave) {
  btnEditorSave.addEventListener('click', async () => {
    if (!editorCanvas) return;
    const editedDataUrl = editorCanvas.toDataURL('image/png');

    const result = await window.electronAPI.saveEditedImage({
      dataUrl: editedDataUrl,
      filePath: currentCaptureData ? currentCaptureData.filePath : null
    });

    if (result && result.success) {
      if (currentCaptureData) currentCaptureData.dataUrl = editedDataUrl;
      if (previewImg) previewImg.src = editedDataUrl;
      
      closeEditor();
      showStatus('Edição salva e copiada com sucesso!', 'success');
    } else {
      showStatus(`Erro ao salvar: ${result ? result.error : 'Desconhecido'}`, 'error');
    }
  });
}