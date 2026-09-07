const btnCaptureImg = document.getElementById('btn-capture-img');
const btnCaptureOcr = document.getElementById('btn-capture-ocr');
const btnCopyText = document.getElementById('btn-copy-text');
const btnCopyLabel = document.getElementById('btn-copy-label');
const statusDiv = document.getElementById('status');

const textContainer = document.getElementById('text-container');
const ocrTextarea = document.getElementById('ocr-textarea');

const previewContainer = document.getElementById('preview-container');
const previewImg = document.getElementById('preview-img');
const previewWrapper = document.getElementById('preview-wrapper');
const badgeClipboard = document.getElementById('badge-clipboard');

let lastFilePath = null;

async function executeCapture(mode) {
  statusDiv.classList.add('hidden');
  textContainer.classList.add('hidden');
  previewContainer.classList.add('hidden');

  btnCaptureImg.disabled = true;
  btnCaptureOcr.disabled = true;

  try {
    const result = await window.electronAPI.startAreaCapture(mode);

    btnCaptureImg.disabled = false;
    btnCaptureOcr.disabled = false;

    if (result && result.cancelled) {
      return;
    }

    if (result && result.success) {
      lastFilePath = result.filePath;

      if (result.dataUrl) {
        previewImg.src = result.dataUrl;
        previewContainer.classList.remove('hidden');
      }

      if (result.mode === 'ocr') {
        textContainer.classList.remove('hidden');
        ocrTextarea.value = result.text || '';

        if (result.text && result.text.length > 0) {
          badgeClipboard.textContent = 'Texto Copiado (Ctrl+V)';
          statusDiv.className = 'text-xs p-4 rounded-2xl border flex items-start gap-3 bg-emerald-950/80 border-emerald-800/80 text-emerald-300 shadow-lg shadow-emerald-950/20';
          statusDiv.innerHTML = `
            <div class="flex-1">
              <p class="font-bold text-white text-sm mb-0.5">Texto Transcrito e Copiado!</p>
              <p class="text-slate-300 text-[11px]">O texto extraído já está no seu teclado. Pressione <strong class="text-emerald-400">Ctrl + V</strong> para colar em qualquer lugar.</p>
            </div>
          `;
        } else {
          badgeClipboard.textContent = 'Sem Texto Detectado';
          statusDiv.className = 'text-xs p-4 rounded-2xl border flex items-start gap-3 bg-amber-950/80 border-amber-800/80 text-amber-300 shadow-lg shadow-amber-950/20';
          statusDiv.innerHTML = `
            <div class="flex-1">
              <p class="font-bold text-white text-sm mb-0.5">Nenhum texto identificado</p>
              <p class="text-slate-300 text-[11px]">A imagem foi capturada, mas nenhum texto legível foi encontrado na área selecionada.</p>
            </div>
          `;
        }
      } else {
        badgeClipboard.textContent = 'Imagem Copiada (Ctrl+V)';
        statusDiv.className = 'text-xs p-4 rounded-2xl border flex items-start gap-3 bg-indigo-950/80 border-indigo-800/80 text-indigo-300 shadow-lg shadow-indigo-950/20';
        statusDiv.innerHTML = `
          <div class="flex-1">
            <p class="font-bold text-white text-sm mb-0.5">Print Copiado e Salvo!</p>
            <p class="text-slate-300 text-[11px]">A imagem foi gravada. Pressione <strong class="text-indigo-400">Ctrl + V</strong> para colar onde quiser.</p>
          </div>
        `;
      }

      statusDiv.classList.remove('hidden');

    } else if (result && result.error) {
      statusDiv.className = 'text-xs p-4 rounded-2xl border flex items-start gap-3 bg-rose-950 border-rose-800 text-rose-300';
      statusDiv.innerHTML = `<p class="font-semibold">Erro: ${result.error}</p>`;
      statusDiv.classList.remove('hidden');
    }

  } catch (err) {
    btnCaptureImg.disabled = false;
    btnCaptureOcr.disabled = false;
    console.error('Erro na captura:', err);
  }
}

btnCaptureImg.addEventListener('click', () => executeCapture('image'));
btnCaptureOcr.addEventListener('click', () => executeCapture('ocr'));

btnCopyText.addEventListener('click', async () => {
  const text = ocrTextarea.value;
  if (text) {
    await window.electronAPI.copyText(text);
    btnCopyLabel.innerText = 'Copiado!';
    setTimeout(() => {
      btnCopyLabel.innerText = 'Copiar Texto';
    }, 2000);
  }
});

previewWrapper.addEventListener('click', () => {
  if (lastFilePath) {
    window.electronAPI.openFile(lastFilePath);
  }
});