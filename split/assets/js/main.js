const fileInput = document.getElementById('image-input');
const selectImageButton = document.getElementById('select-image-button');
const uploadBox = document.getElementById('upload-box');
const downloadButton = document.getElementById('download-button');
const fileNameLabel = document.getElementById('file-name');
const uploadError = document.getElementById('upload-error');
const sliceTotalLabel = document.getElementById('slice-total');
const previewRatio = document.getElementById('preview-ratio');
const previewCaption = document.getElementById('preview-caption');
const previewCanvas = document.getElementById('preview-canvas');
const previewSurface = document.getElementById('preview-surface');
const splitButtons = document.querySelectorAll('.split-option');
const formatButtons = document.querySelectorAll('.format-option');
const resultGrid = document.getElementById('result-grid');
const jpegNotice = document.getElementById('jpeg-notice');

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;

const state = {
    image: null,
    fileName: '',
    fileNameBase: 'image',
    rows: 2,
    cols: 2,
    format: 'image/png',
    isProcessing: false,
    isRendering: false,
    isExporting: false,
    renderRequestId: 0,
    generatedTiles: [],
    objectUrls: []
};

function showError(message) {
    uploadError.textContent = message;
}

function sanitizeFilename(name) {
    return String(name || 'image')
        .replace(/\.[^/.]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim() || 'image';
}

function getTileCount() {
    return state.rows * state.cols;
}

function updateDownloadButtonState() {
    downloadButton.disabled = !state.image
        || state.isRendering
        || state.isExporting
        || state.generatedTiles.length !== getTileCount();
}

function clearGeneratedResults() {
    state.objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    state.objectUrls = [];
    state.generatedTiles = [];
    resultGrid.innerHTML = '';
}

function revokeRenderUrls(urls) {
    urls.forEach((objectUrl) => {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    });
}

function updateSplitSummary() {
    const total = getTileCount();
    sliceTotalLabel.textContent = `${total}장`;
    previewRatio.textContent = `${state.cols} × ${state.rows}`;
}

function setPreset(rows, cols) {
    if (state.rows === rows && state.cols === cols) {
        return;
    }

    state.rows = rows;
    state.cols = cols;
    splitButtons.forEach((button) => {
        const isActive = Number(button.dataset.rows) === rows && Number(button.dataset.cols) === cols;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    updateSplitSummary();
    updatePreview();
    renderResultGrid();
}

function setFormat(newFormat) {
    if (state.format === newFormat) {
        return;
    }

    state.format = newFormat;
    formatButtons.forEach((button) => {
        const isActive = button.dataset.format === newFormat;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    jpegNotice.hidden = newFormat !== 'image/jpeg';
    renderResultGrid();
}

function updatePreview() {
    if (!state.image) {
        previewCanvas.classList.remove('has-image');
        previewCaption.textContent = '선택된 이미지가 없습니다.';
        previewSurface.getContext('2d').clearRect(0, 0, previewSurface.width, previewSurface.height);
        return;
    }

    const ctx = previewSurface.getContext('2d');
    const canvasWidth = 800;
    const canvasHeight = 800;
    const { width, height } = state.image;
    const scale = Math.min(canvasWidth / width, canvasHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = (canvasHeight - drawHeight) / 2;

    previewSurface.width = canvasWidth;
    previewSurface.height = canvasHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(state.image, drawX, drawY, drawWidth, drawHeight);

    ctx.strokeStyle = 'rgba(197, 82, 0, 0.75)';
    ctx.lineWidth = 2;
    const gridXStep = drawWidth / state.cols;
    const gridYStep = drawHeight / state.rows;

    for (let col = 1; col < state.cols; col += 1) {
        const x = drawX + gridXStep * col;
        ctx.beginPath();
        ctx.moveTo(x, drawY);
        ctx.lineTo(x, drawY + drawHeight);
        ctx.stroke();
    }

    for (let row = 1; row < state.rows; row += 1) {
        const y = drawY + gridYStep * row;
        ctx.beginPath();
        ctx.moveTo(drawX, y);
        ctx.lineTo(drawX + drawWidth, y);
        ctx.stroke();
    }

    previewCanvas.classList.add('has-image');
    previewCaption.textContent = `${state.fileName} · ${state.cols}×${state.rows} 분할`;
}

function buildTileMetadata() {
    if (!state.image) {
        return [];
    }

    const tiles = [];
    const imageWidth = state.image.width;
    const imageHeight = state.image.height;

    for (let row = 0; row < state.rows; row += 1) {
        for (let col = 0; col < state.cols; col += 1) {
            const x0 = Math.round((col * imageWidth) / state.cols);
            const x1 = Math.round(((col + 1) * imageWidth) / state.cols);
            const y0 = Math.round((row * imageHeight) / state.rows);
            const y1 = Math.round(((row + 1) * imageHeight) / state.rows);
            const tileWidth = x1 - x0;
            const tileHeight = y1 - y0;
            const tileIndex = tiles.length + 1;

            tiles.push({
                index: tileIndex,
                x0,
                x1,
                y0,
                y1,
                tileWidth,
                tileHeight,
                label: String(tileIndex).padStart(2, '0'),
                name: `${state.fileNameBase}_${String(tileIndex).padStart(2, '0')}`
            });
        }
    }

    return tiles;
}

function createTileCanvas(tile) {
    const canvas = document.createElement('canvas');
    canvas.width = tile.tileWidth;
    canvas.height = tile.tileHeight;
    const context = canvas.getContext('2d');

    if (state.format === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(
        state.image,
        tile.x0,
        tile.y0,
        tile.tileWidth,
        tile.tileHeight,
        0,
        0,
        tile.tileWidth,
        tile.tileHeight
    );

    return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
                return;
            }
            reject(new Error('이미지 생성에 실패했습니다.'));
        }, mimeType, quality);
    });
}

function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderResultGrid() {
    if (!state.image) {
        clearGeneratedResults();
        updateDownloadButtonState();
        return;
    }

    const requestId = ++state.renderRequestId;
    const renderUrls = [];
    const renderTiles = [];

    state.isRendering = true;
    clearGeneratedResults();
    updateDownloadButtonState();

    try {
        const tiles = buildTileMetadata();
        for (const tile of tiles) {
            const tileCanvas = createTileCanvas(tile);
            const blob = await canvasToBlob(
                tileCanvas,
                state.format,
                state.format === 'image/jpeg' ? 0.95 : undefined
            );

            if (requestId !== state.renderRequestId) {
                revokeRenderUrls(renderUrls);
                return;
            }

            const objectUrl = URL.createObjectURL(blob);
            const tileData = {
                ...tile,
                canvas: tileCanvas,
                blob,
                objectUrl,
                extension: state.format === 'image/jpeg' ? 'jpg' : 'png'
            };

            renderUrls.push(objectUrl);
            renderTiles.push(tileData);
        }

        if (requestId !== state.renderRequestId) {
            revokeRenderUrls(renderUrls);
            return;
        }

        const fragment = document.createDocumentFragment();
        renderTiles.forEach((tileData) => {
            const card = document.createElement('article');
            card.className = 'result-card';

            const indexLabel = document.createElement('div');
            indexLabel.className = 'result-index';
            indexLabel.textContent = tileData.label;

            const thumbnailWrap = document.createElement('div');
            thumbnailWrap.className = 'result-thumbnail';

            const thumbnail = document.createElement('img');
            thumbnail.src = tileData.objectUrl;
            thumbnail.alt = `${tileData.name} 미리보기`;

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'button button-secondary result-save';
            saveButton.textContent = '저장';
            saveButton.addEventListener('click', async () => {
                if (state.isRendering) {
                    return;
                }

                const currentBlob = await canvasToBlob(
                    tileData.canvas,
                    state.format,
                    state.format === 'image/jpeg' ? 0.95 : undefined
                );
                triggerDownload(currentBlob, `${tileData.name}.${tileData.extension}`);
            });

            thumbnailWrap.appendChild(thumbnail);
            card.appendChild(indexLabel);
            card.appendChild(thumbnailWrap);
            card.appendChild(saveButton);
            fragment.appendChild(card);
        });

        resultGrid.appendChild(fragment);
        state.objectUrls = renderUrls.slice();
        state.generatedTiles = renderTiles.slice();
    } finally {
        if (requestId === state.renderRequestId) {
            state.isRendering = false;
            updateDownloadButtonState();
        }
    }
}

async function exportSlices() {
    if (state.isExporting) {
        return;
    }

    if (!state.image) {
        showError('이미지를 먼저 선택해주세요.');
        return;
    }

    if (state.isRendering || state.generatedTiles.length !== getTileCount()) {
        return;
    }

    const exportFormat = state.format;
    const exportTiles = state.generatedTiles.slice();
    const exportRows = state.rows;
    const exportCols = state.cols;
    const exportFileNameBase = state.fileNameBase;

    if (exportTiles.length !== exportRows * exportCols) {
        return;
    }

    if (typeof JSZip === 'undefined') {
        showError('분할 이미지 저장 기능을 사용할 수 없습니다.');
        return;
    }

    state.isExporting = true;
    updateDownloadButtonState();

    try {
        const zip = new JSZip();
        const extension = exportFormat === 'image/jpeg' ? 'jpg' : 'png';

        for (const tile of exportTiles) {
            const blob = await canvasToBlob(
                tile.canvas,
                exportFormat,
                exportFormat === 'image/jpeg' ? 0.95 : undefined
            );
            zip.file(`${tile.name}.${extension}`, blob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${exportFileNameBase}_분할.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showError('');
    } catch (error) {
        showError(error.message || '분할 이미지 저장에 실패했습니다.');
    } finally {
        state.isExporting = false;
        updateDownloadButtonState();
    }
}

function readFileAsArrayBuffer(file) {
    if (file.arrayBuffer) {
        return file.arrayBuffer();
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = () => {
            reject(new Error('지원하지 않는 이미지 형식입니다.'));
        };
        reader.readAsArrayBuffer(file);
    });
}

function detectImageFormat(buffer) {
    if (buffer.byteLength < 3) {
        return null;
    }

    const bytes = new Uint8Array(buffer);

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }

    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
        return 'image/png';
    }

    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
    }

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
            reject(new Error('지원하지 않는 이미지 형식입니다.'));
        };

        image.src = url;
    });
}

function resetCurrentImageState() {
    state.renderRequestId += 1;
    clearGeneratedResults();
    state.image = null;
    state.isRendering = false;
    previewCanvas.classList.remove('has-image');
    previewCaption.textContent = '선택된 이미지가 없습니다.';
    fileNameLabel.textContent = '선택된 파일 없음';
    updateDownloadButtonState();
}

async function processFile(file) {
    if (!file || state.isProcessing) {
        return;
    }

    state.isProcessing = true;
    fileInput.disabled = true;
    selectImageButton.disabled = true;
    uploadBox.classList.add('is-processing');
    showError('');

    try {
        if (file.size > MAX_FILE_SIZE) {
            throw new Error('20MB 이하의 이미지를 선택해주세요.');
        }

        const buffer = await readFileAsArrayBuffer(file);
        const detectedType = detectImageFormat(buffer);
        if (!detectedType) {
            throw new Error('지원하지 않는 이미지 형식입니다.');
        }

        const decodedImage = await loadImageFromFile(file);
        if (decodedImage.width * decodedImage.height > MAX_PIXEL_COUNT) {
            throw new Error('이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
        }

        state.image = decodedImage;
        state.fileName = file.name;
        state.fileNameBase = sanitizeFilename(file.name);
        fileNameLabel.textContent = file.name;
        updatePreview();
        await renderResultGrid();
        updateDownloadButtonState();
        showError('');
    } catch (error) {
        resetCurrentImageState();
        showError(error.message || '이미지를 불러오지 못했습니다.');
    } finally {
        state.isProcessing = false;
        fileInput.disabled = false;
        selectImageButton.disabled = false;
        uploadBox.classList.remove('is-processing');
        fileInput.value = '';
    }
}

selectImageButton.addEventListener('click', () => {
    if (state.isProcessing) {
        return;
    }
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    processFile(file);
});

uploadBox.addEventListener('keydown', (event) => {
    if (state.isProcessing) {
        return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
});

uploadBox.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!state.isProcessing) {
        uploadBox.classList.add('is-dragover');
    }
});

uploadBox.addEventListener('dragleave', () => {
    uploadBox.classList.remove('is-dragover');
});

uploadBox.addEventListener('drop', (event) => {
    event.preventDefault();
    uploadBox.classList.remove('is-dragover');
    if (state.isProcessing) {
        return;
    }

    const [file] = event.dataTransfer.files || [];
    processFile(file);
});

splitButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const rows = Number(button.dataset.rows);
        const cols = Number(button.dataset.cols);
        setPreset(rows, cols);
    });
});

formatButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setFormat(button.dataset.format);
    });
});

downloadButton.addEventListener('click', () => {
    exportSlices();
});

updateSplitSummary();
setFormat('image/png');
setPreset(2, 2);
