import { encodeWebPImageData } from '../vendor/webp-encoder.js';

const MAX_FILE_COUNT = 3;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;

const state = {
  files: [],
  selectedFormat: 'jpg',
  isConverting: false,
  isValidating: false,
  results: [],
  jpgBackground: '#ffffff',
};

const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadStatus = document.getElementById('uploadStatus');
const convertStatus = document.getElementById('convertStatus');
const formatButtons = [...document.querySelectorAll('.format-button')];
const convertButton = document.getElementById('convertButton');
const fileListSection = document.getElementById('fileListSection');
const fileList = document.getElementById('fileList');
const resultList = document.getElementById('resultList');
const resultsSection = document.getElementById('resultsSection');
const zipActions = document.getElementById('zipActions');
const jpgBackgroundPanel = document.getElementById('jpgBackgroundPanel');
const jpgBackgroundButtons = [...document.querySelectorAll('.background-button')];

setup();

function setup() {
  bindEvents();
  setFormat('jpg');
  updateJpgBackgroundPanel();
  updateConvertButtonState();
  updateInteractionState();
  renderResults();
}

function bindEvents() {
  const uploadTrigger = document.querySelector('.upload-trigger');
  uploadTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!state.isConverting && !state.isValidating) fileInput.click();
  });
  fileInput.addEventListener('change', handleFilesAdded);

  uploadArea.addEventListener('click', (event) => {
    if (state.isConverting || state.isValidating || event.target === fileInput || event.target.closest('.upload-trigger')) return;
    fileInput.click();
  });

  uploadArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (state.isConverting || state.isValidating) return;
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

  uploadArea.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    if (state.isConverting) return;
    if (state.isValidating) {
      showStatus(uploadStatus, '이미지 검증 중입니다. 완료 후 파일을 추가해 주세요.', 'info');
      return;
    }
    const incoming = event.dataTransfer && event.dataTransfer.files ? [...event.dataTransfer.files] : [];
    handleFilesAdded({ target: { files: incoming } });
  });

  uploadArea.addEventListener('keydown', (event) => {
    if (event.target !== uploadArea) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!state.isConverting && !state.isValidating) fileInput.click();
    }
  });

  formatButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (state.isConverting) return;
      setFormat(button.dataset.format);
    });
  });

  jpgBackgroundButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (state.isConverting) return;
      state.jpgBackground = button.dataset.color;
      jpgBackgroundButtons.forEach((option) => {
        const selected = option === button;
        option.classList.toggle('selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
      if (state.results.length) {
        clearResults();
        showStatus(convertStatus, '배경색 변경으로 이전 결과를 초기화했습니다.', 'info');
      }
    });
  });

  convertButton.addEventListener('click', async () => {
    if (state.isConverting) {
      return;
    }

    if (!state.files.length) {
      showStatus(uploadStatus, '업로드된 이미지가 없습니다. 이미지를 추가해 주세요.', 'error');
      return;
    }

    try {
      await runConversion();
    } catch (error) {
      showStatus(convertStatus, error.message || '변환 중 문제가 발생했습니다.', 'error');
    }
  });

  fileList.addEventListener('click', (event) => {
    if (state.isConverting) return;
    const button = event.target.closest('.delete-button');
    if (!button) return;
    const id = button.dataset.id;
    removeFile(id);
  });

  zipActions.addEventListener('click', (event) => {
    const button = event.target.closest('.zip-button');
    if (!button) return;
    downloadZip();
  });

  resultList.addEventListener('click', (event) => {
    if (state.isConverting) return;
    const button = event.target.closest('.download-button');
    if (!button) return;
    const id = button.dataset.id;
    const result = state.results.find((entry) => entry.id === id);
    if (!result || !result.success || !(result.blob instanceof Blob)) {
      return;
    }
    triggerDownload(result.blob, result.outputName);
  });
}

function showStatus(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.className = 'status-banner';
  if (type === 'error') {
    element.classList.add('error');
  } else if (type === 'success') {
    element.classList.add('success');
  } else {
    element.classList.add('info');
  }
}

function setFormat(format) {
  if (state.isConverting || !['jpg', 'png', 'webp'].includes(format)) return;
  state.selectedFormat = format;
  formatButtons.forEach((button) => {
    const selected = button.dataset.format === format;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  updateJpgBackgroundPanel();

  if (state.results.length) {
    clearResults();
  }

  updateConvertButtonState();
}

function updateJpgBackgroundPanel() {
  const needsBackground = state.files.some((file) => file.format === 'png' || file.format === 'webp');
  jpgBackgroundPanel.classList.toggle('hidden', state.selectedFormat !== 'jpg' || !needsBackground);
}

function updateConvertButtonState() {
  const hasFiles = state.files.length > 0;
  const convertibleExists = state.files.some((file) => file.format !== state.selectedFormat);
  const disabled = !hasFiles || !convertibleExists || state.isConverting || state.isValidating;
  convertButton.disabled = disabled;
}

function updateInteractionState() {
  const uploadDisabled = state.isConverting || state.isValidating;
  fileInput.disabled = uploadDisabled;
  uploadArea.classList.toggle('is-disabled', uploadDisabled);
  uploadArea.setAttribute('aria-disabled', String(uploadDisabled));
  document.querySelector('.upload-trigger').disabled = uploadDisabled;
  formatButtons.forEach((button) => { button.disabled = state.isConverting; });
  jpgBackgroundButtons.forEach((button) => { button.disabled = state.isConverting; });
  fileList.querySelectorAll('.delete-button').forEach((button) => { button.disabled = state.isConverting; });
  updateConvertButtonState();
}

async function handleFilesAdded(event) {
  if (state.isConverting) return;
  const selectedFiles = [...(event.target.files || [])];
  if (event.target === fileInput) fileInput.value = '';
  if (!selectedFiles.length) {
    return;
  }
  if (state.isValidating) {
    showStatus(uploadStatus, '이미지 검증 중입니다. 완료 후 파일을 추가해 주세요.', 'info');
    return;
  }

  state.isValidating = true;
  updateInteractionState();
  const incoming = [];
  const errorMessages = [];
  let hasErrors = false;
  try {
    for (const file of selectedFiles) {
      if (state.files.length + incoming.length >= MAX_FILE_COUNT) {
        errorMessages.push(`최대 ${MAX_FILE_COUNT}장까지만 업로드할 수 있습니다.`);
        hasErrors = true;
        break;
      }

      if (state.files.some((entry) => isSameFile(entry.file, file)) || incoming.some((entry) => isSameFile(entry.file, file))) {
        errorMessages.push(`이미 추가된 파일입니다: ${file.name}`);
        hasErrors = true;
        continue;
      }

      try {
        const pendingBytes = incoming.reduce((sum, entry) => sum + entry.file.size, 0);
        const validated = await validateAndPrepareFile(file, pendingBytes);
        incoming.push(validated);
      } catch (error) {
        errorMessages.push(error.message || '지원하지 않는 이미지입니다.');
        hasErrors = true;
      }
    }

    if (!incoming.length) {
      if (errorMessages.length) {
        showStatus(uploadStatus, errorMessages.slice(0, 3).join(' '), 'error');
      }
      return;
    }

    if (state.results.length) {
      clearResults();
    }

    for (const item of incoming) {
      state.files.push(item);
    }

    if (!hasErrors) {
      uploadStatus.textContent = `${incoming.length}개의 이미지가 추가되었습니다.`;
      uploadStatus.className = 'status-banner info';
    } else if (incoming.length) {
      const details = errorMessages.slice(0, 3).join(' ');
      const remaining = errorMessages.length > 3 ? ` 외 ${errorMessages.length - 3}건` : '';
      showStatus(uploadStatus, `${incoming.length}개의 정상 이미지가 추가되었습니다. 문제가 있는 파일은 제외했습니다. ${details}${remaining}`, 'error');
    }
    renderFileList();
    updateJpgBackgroundPanel();
    updateConvertButtonState();
  } finally {
    state.isValidating = false;
    updateInteractionState();
  }
}

function isSameFile(fileA, fileB) {
  return fileA.name === fileB.name && fileA.size === fileB.size && fileA.lastModified === fileB.lastModified;
}

async function validateAndPrepareFile(file, pendingBytes = 0) {
  if (!file || !file.name) {
    throw new Error('올바른 파일을 선택해 주세요.');
  }

  if (file.size <= 0) {
    throw new Error(`${file.name}은(는) 비어 있는 파일이라 처리할 수 없습니다.`);
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name}은(는) 20MB를 초과해 업로드할 수 없습니다.`);
  }

  const totalBytes = state.files.reduce((sum, entry) => sum + entry.file.size, 0) + pendingBytes + file.size;
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error('업로드한 이미지 총 용량이 60MB를 초과해 더 추가할 수 없습니다.');
  }

  const buffer = await file.arrayBuffer();
  const signature = new Uint8Array(buffer.slice(0, 16));
  const type = detectImageType(signature);

  if (!type) {
    throw new Error(`${file.name}은(는) 지원하지 않는 파일 형식입니다. JPG, PNG, WEBP 파일만 업로드할 수 있습니다.`);
  }

  const image = await loadImageFromFile(file);
  const pixelCount = image.width * image.height;
  if (pixelCount > MAX_IMAGE_PIXELS) {
    throw new Error(`${file.name}은(는) 해상도가 너무 높아 업로드할 수 없습니다. 최대 ${MAX_IMAGE_PIXELS.toLocaleString('ko-KR')}픽셀까지 지원합니다.`);
  }
  const readyItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    format: type,
    name: file.name,
    width: image.width,
    height: image.height,
    previewUrl: URL.createObjectURL(file),
  };

  return readyItem;
}

function detectImageType(signature) {
  const isPng = signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4e && signature[3] === 0x47
    && signature[4] === 0x0d && signature[5] === 0x0a && signature[6] === 0x1a && signature[7] === 0x0a;
  const isJpg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isWebP = signature[0] === 0x52 && signature[1] === 0x49 && signature[2] === 0x46 && signature[3] === 0x46
    && signature[8] === 0x57 && signature[9] === 0x45 && signature[10] === 0x42 && signature[11] === 0x50;

  if (isPng) return 'png';
  if (isJpg) return 'jpg';
  if (isWebP) return 'webp';

  return null;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name}은(는) 읽을 수 없는 이미지입니다.`));
    };
    image.src = url;
  });
}

function renderFileList() {
  if (!state.files.length) {
    fileListSection.classList.add('hidden');
    fileList.innerHTML = '';
    return;
  }

  fileListSection.classList.remove('hidden');
  fileList.innerHTML = state.files
    .map((item) => {
      const safeName = escapeHtml(item.name);
      return `
        <div class="file-item" data-id="${item.id}">
          <img class="file-thumb" src="${item.previewUrl}" alt="${safeName} 미리보기" />
          <div class="file-meta">
            <span class="file-name">${safeName}</span>
            <div class="file-info-list">
              <span>${item.format.toUpperCase()}</span>
              <span>${formatBytes(item.file.size)}</span>
              <span>${item.width} × ${item.height}</span>
            </div>
          </div>
          <div class="file-action">
            <button class="delete-button" type="button" data-id="${item.id}">삭제</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function removeFile(id) {
  if (state.isConverting) return;
  const fileIndex = state.files.findIndex((entry) => entry.id === id);
  if (fileIndex === -1) return;

  const [removed] = state.files.splice(fileIndex, 1);
  if (removed && removed.previewUrl) {
    URL.revokeObjectURL(removed.previewUrl);
  }

  state.results = state.results.filter((entry) => {
    const matches = entry.id === id || entry.id === `${id}-skip` || entry.id === `${id}-failed`;
    if (matches && entry.blob && entry.previewUrl && entry.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    return !matches;
  });

  renderFileList();
  renderResults();
  updateJpgBackgroundPanel();
  updateConvertButtonState();

  if (!state.files.length) {
    showStatus(uploadStatus, '모든 이미지가 제거되었습니다. 다시 이미지를 업로드해 주세요.', 'info');
    state.results = [];
    renderResults();
  }
}

async function runConversion() {
  if (!state.files.length) {
    throw new Error('업로드된 이미지가 없습니다.');
  }

  const convertible = state.files.filter((file) => file.format !== state.selectedFormat);
  if (!convertible.length) {
    showStatus(convertStatus, '모든 이미지가 이미 선택한 형식입니다. 변환이 필요하지 않습니다.', 'info');
    return;
  }

  state.isConverting = true;
  updateInteractionState();
  clearResults();
  const resultEntries = [];
  const allocatedNames = new Set();
  let resultsCommitted = false;

  try {
    for (let index = 0; index < state.files.length; index += 1) {
      const item = state.files[index];
      const progressText = `${index + 1} / ${state.files.length}`;
      showStatus(convertStatus, `이미지를 변환하고 있습니다. (${progressText})`, 'info');

      if (item.format === state.selectedFormat) {
        resultEntries.push({
          id: `${item.id}-skip`,
          originalFormat: item.format,
          originalName: item.name,
          originalBytes: item.file.size,
          originalWidth: item.width,
          originalHeight: item.height,
          outputFormat: state.selectedFormat,
          outputName: item.name,
          outputBytes: item.file.size,
          outputWidth: item.width,
          outputHeight: item.height,
          previewUrl: item.previewUrl,
          status: '변환 불필요',
          success: true,
          message: '이미 선택한 형식과 동일하여 변환하지 않았습니다.',
        });
        continue;
      }

      const outputName = generateOutputName(item.name, state.selectedFormat, allocatedNames);
      try {
        const result = await convertSingleFile(item, outputName);
        resultEntries.push(result);
      } catch (error) {
        resultEntries.push({
          id: `${item.id}-failed`,
          originalFormat: item.format,
          originalName: item.name,
          originalBytes: item.file.size,
          originalWidth: item.width,
          originalHeight: item.height,
          outputFormat: state.selectedFormat,
          outputName,
          outputBytes: 0,
          outputWidth: item.width,
          outputHeight: item.height,
          previewUrl: item.previewUrl,
          status: '변환 실패',
          success: false,
          message: error.message || '이미지 변환에 실패했습니다.',
        });
      }
    }

    state.results = resultEntries;
    resultsCommitted = true;
    renderResults();

    const successCount = resultEntries.filter((entry) => entry.success && entry.blob).length;
    const failCount = resultEntries.filter((entry) => !entry.success && entry.status === '변환 실패').length;
    const skipCount = resultEntries.filter((entry) => entry.status === '변환 불필요').length;

    if (successCount || failCount || skipCount) {
      const summary = `${state.files.length}장 중 ${successCount}장 변환 완료${failCount ? `, ${failCount}장 변환 실패` : ''}${skipCount ? `, ${skipCount}장 변환 불필요` : ''}`;
      showStatus(convertStatus, summary, successCount > 0 ? 'success' : 'info');
    }
  } finally {
    if (!resultsCommitted) {
      resultEntries.forEach((entry) => {
        if (entry.blob && entry.previewUrl && entry.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
    }
    state.isConverting = false;
    updateInteractionState();
  }
}

async function convertSingleFile(item, outputName) {
  const image = await loadImageFromFile(item.file);
  const canvas = document.createElement('canvas');
  canvas.width = item.width;
  canvas.height = item.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error(`${item.name}의 이미지 처리에 실패했습니다.`);
  }

  if (state.selectedFormat === 'jpg') {
    ctx.fillStyle = state.jpgBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  let blob;
  const mimeType = getMimeTypeForFormat(state.selectedFormat);
  const quality = state.selectedFormat === 'jpg' || state.selectedFormat === 'webp' ? 0.92 : 1;

  if (state.selectedFormat === 'webp') {
    let canvasError;
    if (canvasSupportsWebP()) {
      try {
        blob = await canvasToBlob(canvas, mimeType, quality);
        if (!(await isBlobOfExpectedType(blob, 'webp'))) blob = null;
      } catch (error) {
        canvasError = error;
      }
    }
    if (!blob) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      try {
        blob = await encodeWebPImageData(imageData, 92);
      } catch (error) {
        if (canvasError) {
          throw new Error(`${error.message} Canvas 인코딩 오류: ${canvasError.message || canvasError}`);
        }
        throw error;
      }
    }
  } else {
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  if (!blob || blob.size === 0) {
    throw new Error(`${item.name}의 변환 결과가 비어 있습니다.`);
  }

  if (!(await isBlobOfExpectedType(blob, state.selectedFormat))) {
    throw new Error(`${item.name}의 변환 파일 형식이 올바르지 않습니다.`);
  }

  const outputUrl = URL.createObjectURL(blob);

  return {
    id: item.id,
    originalFormat: item.format,
    originalName: item.name,
    originalBytes: item.file.size,
    originalWidth: item.width,
    originalHeight: item.height,
    outputFormat: state.selectedFormat,
    outputName,
    outputBytes: blob.size,
    outputWidth: item.width,
    outputHeight: item.height,
    previewUrl: outputUrl,
    blob,
    status: '변환 완료',
    success: true,
    message: `${item.format.toUpperCase()} → ${state.selectedFormat.toUpperCase()}`,
  };
}

function clearResults() {
  state.results.forEach((entry) => {
    if (entry.blob && entry.previewUrl && entry.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(entry.previewUrl);
    }
  });
  state.results = [];
  renderResults();
}

function renderResults() {
  const successEntries = state.results.filter((entry) => entry.success && entry.blob instanceof Blob);
  const zipVisible = successEntries.length > 1;
  zipActions.innerHTML = zipVisible
    ? '<button type="button" class="zip-button">전체 다운로드 (ZIP)</button>'
    : '';

  if (!state.results.length) {
    resultsSection.classList.add('hidden');
    resultList.innerHTML = '';
    return;
  }

  resultsSection.classList.remove('hidden');

  resultList.innerHTML = state.results
    .map((entry) => {
      if (entry.status === '변환 불필요') {
        return `
          <article class="result-card">
            <div class="result-head">
              <div class="result-label">${escapeHtml(entry.originalName)}</div>
              <span class="result-status success">변환 불필요</span>
            </div>
            <div class="result-preview-grid">
              <div class="preview-box">
                <img src="${entry.previewUrl || ''}" alt="${escapeHtml(entry.originalName)} 미리보기" />
              </div>
              <div class="result-info-grid">
                <div class="info-panel">
                  <h4>원본 이미지</h4>
                  <div class="info-list">
                    <div class="info-item"><span>파일명</span><strong>${escapeHtml(entry.originalName)}</strong></div>
                    <div class="info-item"><span>형식</span><strong>${entry.originalFormat.toUpperCase()}</strong></div>
                    <div class="info-item"><span>용량</span><strong>${formatBytes(entry.originalBytes)}</strong></div>
                    <div class="info-item"><span>해상도</span><strong>${entry.originalWidth} × ${entry.originalHeight}</strong></div>
                  </div>
                </div>
                <div class="info-panel">
                  <h4>변환 결과</h4>
                  <div class="info-list">
                    <div class="info-item"><span>파일명</span><strong>${escapeHtml(entry.outputName)}</strong></div>
                    <div class="info-item"><span>형식</span><strong>${entry.outputFormat.toUpperCase()}</strong></div>
                    <div class="info-item"><span>용량</span><strong>${formatBytes(entry.outputBytes)}</strong></div>
                    <div class="info-item"><span>해상도</span><strong>${entry.outputWidth} × ${entry.outputHeight}</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `;
      }

      const statusClass = entry.success ? 'success' : 'failed';
      const statusText = entry.success ? entry.status : '변환 실패';

      return `
        <article class="result-card">
          <div class="result-head">
            <div class="result-label">${entry.success ? `${entry.originalFormat.toUpperCase()} → ${entry.outputFormat.toUpperCase()}` : '변환 실패'}</div>
            <span class="result-status ${statusClass}">${statusText}</span>
          </div>
          <div class="result-preview-grid">
            <div class="preview-box">
              <img src="${entry.previewUrl || ''}" alt="${escapeHtml(entry.originalName)} 결과 미리보기" />
            </div>
            <div class="result-info-grid">
              <div class="info-panel">
                <h4>원본 이미지</h4>
                <div class="info-list">
                  <div class="info-item"><span>파일명</span><strong>${escapeHtml(entry.originalName)}</strong></div>
                  <div class="info-item"><span>형식</span><strong>${entry.originalFormat.toUpperCase()}</strong></div>
                  <div class="info-item"><span>용량</span><strong>${formatBytes(entry.originalBytes)}</strong></div>
                  <div class="info-item"><span>해상도</span><strong>${entry.originalWidth} × ${entry.originalHeight}</strong></div>
                </div>
              </div>
              <div class="info-panel">
                <h4>변환 결과</h4>
                <div class="info-list">
                  <div class="info-item"><span>파일명</span><strong>${escapeHtml(entry.outputName)}</strong></div>
                  <div class="info-item"><span>형식</span><strong>${entry.outputFormat.toUpperCase()}</strong></div>
                  <div class="info-item"><span>용량</span><strong>${entry.success ? formatBytes(entry.outputBytes) : '—'}</strong></div>
                  <div class="info-item"><span>해상도</span><strong>${entry.outputWidth} × ${entry.outputHeight}</strong></div>
                </div>
              </div>
            </div>
          </div>
          <div class="status-banner ${entry.success ? 'success' : 'error'}">${entry.success ? '이미지 변환이 완료되었습니다.' : escapeHtml(entry.message)}</div>
          ${entry.success && entry.blob ? `
            <div class="result-actions">
              <button class="download-button" type="button" data-id="${entry.id}">다운로드</button>
            </div>
          ` : ''}
        </article>
      `;
    })
    .join('');
}

function getMimeTypeForFormat(format) {
  if (format === 'jpg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  return 'image/webp';
}

function generateOutputName(originalName, format, allocatedNames = new Set()) {
  const usedNames = new Set([
    ...state.results.filter((entry) => entry.success && entry.blob).map((entry) => entry.outputName.toLowerCase()),
    ...allocatedNames,
  ]);
  const candidate = createUniqueOutputName(originalName, format, usedNames);
  allocatedNames.add(candidate.toLowerCase());
  return candidate;
}

function createUniqueOutputName(originalName, format, usedNames) {
  const cleaned = originalName.replace(/\.[^/.]+$/, '') || 'image';
  const ext = format === 'jpg' ? 'jpg' : format;
  let candidate = `${cleaned}.${ext}`;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${cleaned}-${suffix}.${ext}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function canvasSupportImageType(type) {
  const canvas = document.createElement('canvas');
  return !!canvas.toDataURL && canvas.toDataURL(type).startsWith('data:' + type.replace('/', '/'));
}

function canvasSupportsWebP() {
  const canvas = document.createElement('canvas');
  if (!canvas.toDataURL) return false;
  const dataUrl = canvas.toDataURL('image/webp', 0.92);
  return dataUrl.startsWith('data:image/webp');
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('캔버스 인코딩에 실패했습니다.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

async function isBlobOfExpectedType(blob, format) {
  const fileType = blob.type.toLowerCase();
  const expected = getMimeTypeForFormat(format);
  if (!(fileType === expected || (format === 'jpg' && fileType === 'image/jpg'))) return false;
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (format === 'webp') {
    return header.length >= 12
      && header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
      && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  }
  if (format === 'png') {
    return header.length >= 8
      && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;
  }
  return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

async function downloadZip() {
  if (state.isConverting) return;
  if (!window.JSZip) {
    showStatus(convertStatus, 'ZIP 라이브러리를 불러오지 못했습니다. 개별 다운로드를 사용해 주세요.', 'error');
    return;
  }

  const successful = state.results.filter((entry) => entry.success && entry.blob instanceof Blob);
  if (successful.length < 2) {
    return;
  }

  try {
    const zip = new JSZip();
    const usedNames = new Set();
    successful.forEach((entry) => {
      const name = createUniqueOutputName(entry.outputName, entry.outputFormat, usedNames);
      zip.file(name, entry.blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    if (!(zipBlob instanceof Blob) || zipBlob.size === 0) {
      throw new Error('ZIP 결과가 비어 있습니다.');
    }
    triggerDownload(zipBlob, 'PixConvert_Images.zip');
    showStatus(convertStatus, 'ZIP 파일이 다운로드되었습니다.', 'success');
  } catch (error) {
    showStatus(convertStatus, `ZIP 생성에 실패했습니다. 개별 다운로드를 사용해 주세요. ${error.message || ''}`.trim(), 'error');
  }
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
