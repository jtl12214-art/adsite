const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;
const POSITION_NAMES = {
    'top-left': ['left', 'top'],
    'top-center': ['center', 'top'],
    'top-right': ['right', 'top'],
    'middle-left': ['left', 'center'],
    center: ['center', 'center'],
    'middle-right': ['right', 'center'],
    'bottom-left': ['left', 'bottom'],
    'bottom-center': ['center', 'bottom'],
    'bottom-right': ['right', 'bottom']
};

const elements = {
    sourceInput: document.getElementById('source-input'),
    sourceUploadBox: document.getElementById('source-upload-box'),
    sourceFileName: document.getElementById('source-file-name'),
    sourceError: document.getElementById('source-error'),
    kindButtons: document.querySelectorAll('[data-kind]'),
    textSettings: document.getElementById('text-settings'),
    imageSettings: document.getElementById('image-settings'),
    watermarkInput: document.getElementById('watermark-input'),
    watermarkUploadBox: document.getElementById('watermark-upload-box'),
    watermarkFileName: document.getElementById('watermark-file-name'),
    watermarkError: document.getElementById('watermark-error'),
    deleteWatermark: document.getElementById('delete-watermark'),
    textInput: document.getElementById('watermark-text'),
    colorInput: document.getElementById('text-color'),
    colorButtons: document.querySelectorAll('[data-color]'),
    weightButtons: document.querySelectorAll('[data-weight]'),
    positionButtons: document.querySelectorAll('[data-position]'),
    sizeInput: document.getElementById('size-slider'),
    sizeValue: document.getElementById('size-value'),
    opacityInput: document.getElementById('opacity-slider'),
    opacityValue: document.getElementById('opacity-value'),
    marginInput: document.getElementById('margin-slider'),
    marginValue: document.getElementById('margin-value'),
    rotationInput: document.getElementById('rotation-slider'),
    rotationValue: document.getElementById('rotation-value'),
    formatButtons: document.querySelectorAll('[data-format]'),
    jpegNotice: document.getElementById('jpeg-notice'),
    saveButton: document.getElementById('save-button'),
    resetButton: document.getElementById('reset-watermark'),
    exportError: document.getElementById('export-error'),
    previewStage: document.getElementById('preview-stage'),
    previewCaption: document.getElementById('preview-caption'),
    emptyPreview: document.getElementById('empty-preview'),
    canvas: document.getElementById('preview-canvas')
};

const context = elements.canvas.getContext('2d');
if (!context) {
    throw new Error('Canvas를 초기화할 수 없습니다.');
}

const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');
if (!measureContext) {
    throw new Error('워터마크 글꼴을 준비하지 못했습니다.');
}

const state = {
    sourceImage: null,
    sourceUrl: '',
    sourceFileName: '',
    sourceFileNameBase: '',
    sourceUploadRequestId: 0,
    watermarkImage: null,
    watermarkUrl: '',
    watermarkFileName: '',
    watermarkUploadRequestId: 0,
    kind: 'text',
    text: 'PIX',
    color: '#ffffff',
    weight: 'bold',
    position: 'bottom-right',
    xNorm: 0.5,
    yNorm: 0.5,
    size: 40,
    opacity: 70,
    rotation: 0,
    edgeMargin: 24,
    format: 'image/png',
    isSourceProcessing: false,
    isWatermarkProcessing: false,
    isExporting: false,
    renderRequestId: 0,
    pointerDrag: null,
    imageRect: null,
    renderError: false,
    sourceError: '',
    watermarkError: '',
    exportUrls: new Set()
};

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function showError(element, message) {
    element.textContent = message;
}

function getWatermarkSettings() {
    return {
        kind: state.kind,
        text: state.text,
        color: state.color,
        weight: state.weight,
        image: state.watermarkImage,
        position: state.position,
        xNorm: state.xNorm,
        yNorm: state.yNorm,
        size: state.size,
        opacity: state.opacity,
        rotation: state.rotation,
        edgeMargin: state.edgeMargin
    };
}

function hasWatermarkContent() {
    return state.kind === 'text' ? state.text.trim().length > 0 : Boolean(state.watermarkImage);
}

function updateSaveButton() {
    const hasRelevantError = Boolean(state.sourceError)
        || (state.kind === 'image' && Boolean(state.watermarkError));
    elements.saveButton.disabled = !state.sourceImage
        || state.isSourceProcessing
        || state.isWatermarkProcessing
        || state.isExporting
        || !hasWatermarkContent()
        || hasRelevantError
        || state.renderError;
}

function updateUploadControls() {
    const sourceBusy = state.isSourceProcessing;
    elements.sourceInput.disabled = sourceBusy;
    elements.sourceUploadBox.classList.toggle('is-processing', sourceBusy);
    elements.sourceUploadBox.setAttribute('aria-busy', String(sourceBusy));
    const watermarkBusy = state.isWatermarkProcessing;
    elements.watermarkInput.disabled = watermarkBusy;
    elements.watermarkUploadBox.classList.toggle('is-processing', watermarkBusy);
    elements.watermarkUploadBox.setAttribute('aria-busy', String(watermarkBusy));
    elements.deleteWatermark.disabled = !state.watermarkImage || watermarkBusy;
    updateSaveButton();
}

function sanitizeFilename(fileName) {
    return String(fileName || 'image')
        .replace(/\.[^/.]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim() || 'image';
}

function parseImageSignature(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (bytes.length >= 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
        return 'image/png';
    }
    if (bytes.length >= 12
        && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
    }
    return null;
}

function decodeImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => resolve({ image, objectUrl });
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('지원하지 않는 이미지 형식입니다.'));
        };
        image.src = objectUrl;
    });
}

async function validateAndDecode(file) {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error('20MB 이하의 이미지를 선택해주세요.');
    }
    const signature = parseImageSignature(await file.arrayBuffer());
    if (!signature) {
        throw new Error('지원하지 않는 이미지 형식입니다.');
    }
    const decoded = await decodeImage(file);
    if (decoded.image.naturalWidth * decoded.image.naturalHeight > MAX_PIXEL_COUNT) {
        URL.revokeObjectURL(decoded.objectUrl);
        throw new Error('이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
    }
    return decoded;
}

function resetPositionForPreset() {
    const geometry = state.sourceImage
        ? calculateWatermarkGeometry(state.sourceImage.naturalWidth, state.sourceImage.naturalHeight, getWatermarkSettings())
        : null;
    if (geometry) {
        state.xNorm = geometry.centerX / state.sourceImage.naturalWidth;
        state.yNorm = geometry.centerY / state.sourceImage.naturalHeight;
    }
}

async function processSourceFile(file) {
    if (!file || state.isSourceProcessing) return;
    const requestId = ++state.sourceUploadRequestId;
    state.isSourceProcessing = true;
    state.sourceError = '';
    state.pointerDrag = null;
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.sourceImage = null;
    state.sourceUrl = '';
    state.sourceFileName = '';
    state.sourceFileNameBase = '';
    elements.sourceFileName.textContent = '처리 중...';
    showError(elements.sourceError, '');
    showError(elements.exportError, '');
    renderPreview();
    updateUploadControls();

    try {
        const decoded = await validateAndDecode(file);
        if (requestId !== state.sourceUploadRequestId) {
            URL.revokeObjectURL(decoded.objectUrl);
            return;
        }
        state.sourceImage = decoded.image;
        state.sourceUrl = decoded.objectUrl;
        state.sourceFileName = file.name;
        state.sourceFileNameBase = sanitizeFilename(file.name);
        elements.sourceFileName.textContent = file.name;
        state.position = 'bottom-right';
        state.xNorm = 0.5;
        state.yNorm = 0.5;
        resetPositionForPreset();
        renderPreview();
    } catch (error) {
        if (requestId === state.sourceUploadRequestId) {
            state.sourceImage = null;
            state.sourceUrl = '';
            state.sourceFileName = '';
            state.sourceFileNameBase = '';
            elements.sourceFileName.textContent = '선택된 파일 없음';
            state.sourceError = error.message || '이미지를 불러오지 못했습니다.';
            showError(elements.sourceError, state.sourceError);
            renderPreview();
        }
    } finally {
        if (requestId === state.sourceUploadRequestId) {
            state.isSourceProcessing = false;
            elements.sourceInput.value = '';
            updateUploadControls();
        }
    }
}

async function processWatermarkFile(file) {
    if (!file || state.isWatermarkProcessing) return;
    const requestId = ++state.watermarkUploadRequestId;
    state.isWatermarkProcessing = true;
    state.watermarkError = '';
    showError(elements.watermarkError, '');
    showError(elements.exportError, '');
    elements.watermarkFileName.textContent = '처리 중...';
    updateUploadControls();

    try {
        const decoded = await validateAndDecode(file);
        if (requestId !== state.watermarkUploadRequestId) {
            URL.revokeObjectURL(decoded.objectUrl);
            return;
        }
        if (state.watermarkUrl) URL.revokeObjectURL(state.watermarkUrl);
        state.watermarkImage = decoded.image;
        state.watermarkUrl = decoded.objectUrl;
        state.watermarkFileName = file.name;
        elements.watermarkFileName.textContent = file.name;
        state.position = 'bottom-right';
        state.xNorm = 0.5;
        state.yNorm = 0.5;
        resetPositionForPreset();
        renderPreview();
    } catch (error) {
        if (requestId === state.watermarkUploadRequestId) {
            state.watermarkError = error.message || '워터마크 이미지를 불러오지 못했습니다.';
            showError(elements.watermarkError, state.watermarkError);
            elements.watermarkFileName.textContent = state.watermarkImage
                ? state.watermarkFileName
                : '워터마크 이미지 없음';
            renderPreview();
        }
    } finally {
        if (requestId === state.watermarkUploadRequestId) {
            state.isWatermarkProcessing = false;
            elements.watermarkInput.value = '';
            updateUploadControls();
        }
    }
}

function getTextStyle(settings, fontSize) {
    const fontWeight = settings.weight === 'bold' ? '700' : '400';
    return `${fontWeight} ${fontSize}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
}

function getUnrotatedWatermarkSize(settings, targetWidth, targetHeight) {
    if (settings.kind === 'image') {
        if (!settings.image) return null;
        const widthRatio = 0.05 + ((settings.size - 10) / 90) * 0.45;
        const width = targetWidth * widthRatio;
        const height = width * (settings.image.naturalHeight / settings.image.naturalWidth);
        return { width, height, fontSize: 0 };
    }
    const text = settings.text.trim();
    if (!text) return null;
    const fontSize = Math.min(targetWidth, targetHeight) * (0.015 + ((settings.size - 10) / 90) * 0.095);
    measureContext.font = getTextStyle(settings, fontSize);
    const metrics = measureContext.measureText(text);
    const measuredHeight = (metrics.actualBoundingBoxAscent || fontSize * 0.9)
        + (metrics.actualBoundingBoxDescent || fontSize * 0.25);
    return {
        width: Math.max(fontSize * 0.5, metrics.width),
        height: Math.max(fontSize * 1.2, measuredHeight),
        fontSize
    };
}

function getRotatedBounds(width, height, rotation) {
    const radians = rotation * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    return {
        width: width * cosine + height * sine,
        height: width * sine + height * cosine
    };
}

function clampCenter(value, halfBounds, extent) {
    if (halfBounds * 2 >= extent) return extent / 2;
    return clamp(value, halfBounds, extent - halfBounds);
}

function calculateWatermarkGeometry(targetWidth, targetHeight, settings) {
    const originalSize = getUnrotatedWatermarkSize(settings, targetWidth, targetHeight);
    if (!originalSize || !targetWidth || !targetHeight) return null;
    const initialBounds = getRotatedBounds(originalSize.width, originalSize.height, settings.rotation);
    const fitScale = Math.min(
        1,
        targetWidth / Math.max(1, initialBounds.width),
        targetHeight / Math.max(1, initialBounds.height)
    );
    const width = originalSize.width * fitScale;
    const height = originalSize.height * fitScale;
    const fontSize = originalSize.fontSize * fitScale;
    const bounds = getRotatedBounds(width, height, settings.rotation);
    let centerX = settings.xNorm * targetWidth;
    let centerY = settings.yNorm * targetHeight;

    if (settings.position !== 'custom') {
        const [horizontal, vertical] = POSITION_NAMES[settings.position] || POSITION_NAMES['bottom-right'];
        const margin = Math.max(0, settings.edgeMargin);
        centerX = horizontal === 'left'
            ? bounds.width / 2 + margin
            : (horizontal === 'right' ? targetWidth - bounds.width / 2 - margin : targetWidth / 2);
        centerY = vertical === 'top'
            ? bounds.height / 2 + margin
            : (vertical === 'bottom' ? targetHeight - bounds.height / 2 - margin : targetHeight / 2);
    }
    centerX = clampCenter(centerX, bounds.width / 2, targetWidth);
    centerY = clampCenter(centerY, bounds.height / 2, targetHeight);

    return {
        centerX,
        centerY,
        width,
        height,
        fontSize,
        boundsWidth: bounds.width,
        boundsHeight: bounds.height,
        rotation: settings.rotation,
        opacity: settings.opacity / 100,
        kind: settings.kind,
        text: settings.text.trim(),
        color: settings.color,
        weight: settings.weight,
        image: settings.image
    };
}

function getPreviewDimensions() {
    const style = getComputedStyle(elements.previewStage);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return {
        width: Math.max(1, elements.previewStage.clientWidth - horizontalPadding),
        height: Math.max(1, elements.previewStage.clientHeight - verticalPadding)
    };
}

function drawWatermark(targetContext, geometry, centerX, centerY, scale, withOutline) {
    if (!geometry) return;
    targetContext.save();
    targetContext.globalAlpha = geometry.opacity;
    targetContext.translate(centerX, centerY);
    targetContext.rotate(geometry.rotation * Math.PI / 180);
    if (geometry.kind === 'image' && geometry.image) {
        targetContext.drawImage(
            geometry.image,
            -geometry.width * scale / 2,
            -geometry.height * scale / 2,
            geometry.width * scale,
            geometry.height * scale
        );
    } else if (geometry.kind === 'text' && geometry.text) {
        targetContext.font = getTextStyle(geometry, geometry.fontSize * scale);
        targetContext.textAlign = 'center';
        targetContext.textBaseline = 'middle';
        targetContext.fillStyle = geometry.color;
        targetContext.fillText(geometry.text, 0, 0);
    }
    targetContext.restore();

    if (withOutline) {
        targetContext.save();
        targetContext.translate(centerX, centerY);
        targetContext.rotate(geometry.rotation * Math.PI / 180);
        targetContext.strokeStyle = 'rgba(45, 42, 38, 0.82)';
        targetContext.lineWidth = 3;
        targetContext.setLineDash([5, 4]);
        targetContext.strokeRect(
            -geometry.width * scale / 2,
            -geometry.height * scale / 2,
            geometry.width * scale,
            geometry.height * scale
        );
        targetContext.restore();
    }
}

function renderPreview() {
    const requestId = ++state.renderRequestId;
    state.renderError = false;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const available = getPreviewDimensions();
    elements.canvas.style.width = `${available.width}px`;
    elements.canvas.style.height = `${available.height}px`;
    elements.canvas.width = Math.max(1, Math.round(available.width * dpr));
    elements.canvas.height = Math.max(1, Math.round(available.height * dpr));
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, available.width, available.height);
    context.fillStyle = '#EDEAE6';
    context.fillRect(0, 0, available.width, available.height);
    elements.emptyPreview.hidden = Boolean(state.sourceImage);

    if (!state.sourceImage) {
        state.imageRect = null;
        elements.canvas.classList.remove('is-interactive', 'is-dragging');
        elements.canvas.setAttribute('aria-label', '워터마크 미리보기');
        elements.previewCaption.textContent = '이미지를 업로드하면 워터마크를 미리볼 수 있습니다.';
        updateSaveButton();
        return;
    }

    try {
        const imageWidth = state.sourceImage.naturalWidth;
        const imageHeight = state.sourceImage.naturalHeight;
        const scale = Math.min(available.width / imageWidth, available.height / imageHeight);
        const displayWidth = imageWidth * scale;
        const displayHeight = imageHeight * scale;
        const offsetX = (available.width - displayWidth) / 2;
        const offsetY = (available.height - displayHeight) / 2;
        state.imageRect = { x: offsetX, y: offsetY, width: displayWidth, height: displayHeight, scale };
        context.drawImage(state.sourceImage, offsetX, offsetY, displayWidth, displayHeight);

        const geometry = calculateWatermarkGeometry(imageWidth, imageHeight, getWatermarkSettings());
        if (geometry) {
            const centerX = offsetX + geometry.centerX * scale;
            const centerY = offsetY + geometry.centerY * scale;
            drawWatermark(context, geometry, centerX, centerY, scale, true);
            elements.canvas.classList.add('is-interactive');
            elements.canvas.setAttribute('aria-label', `${imageWidth} × ${imageHeight} 픽셀 사진의 워터마크 미리보기`);
        } else {
            elements.canvas.classList.remove('is-interactive');
            elements.canvas.setAttribute('aria-label', '워터마크 미리보기');
        }

        if (state.kind === 'image' && !state.watermarkImage) {
            elements.previewCaption.textContent = `${state.sourceFileName} · 워터마크 이미지를 추가해주세요.`;
        } else if (state.kind === 'text' && !state.text.trim()) {
            elements.previewCaption.textContent = `${state.sourceFileName} · 워터마크 문구를 입력해주세요.`;
        } else {
            elements.previewCaption.textContent = `${state.sourceFileName} · ${imageWidth} × ${imageHeight} px`;
        }
    } catch (error) {
        if (requestId === state.renderRequestId) {
            state.renderError = true;
            showError(elements.sourceError, error.message || '미리보기를 표시하지 못했습니다.');
        }
    }
    updateSaveButton();
}

function updateSettingControls() {
    elements.kindButtons.forEach((button) => {
        const active = button.dataset.kind === state.kind;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    elements.textSettings.hidden = state.kind !== 'text';
    elements.imageSettings.hidden = state.kind !== 'image';
    elements.sizeInput.value = String(state.size);
    elements.sizeValue.value = String(state.size);
    elements.opacityInput.value = String(state.opacity);
    elements.opacityValue.value = `${state.opacity}%`;
    elements.marginInput.value = String(state.edgeMargin);
    elements.marginValue.value = `${state.edgeMargin} px`;
    elements.rotationInput.value = String(state.rotation);
    elements.rotationValue.value = `${state.rotation}°`;
    elements.formatButtons.forEach((button) => {
        const active = button.dataset.format === state.format;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    elements.jpegNotice.hidden = state.format !== 'image/jpeg';
    elements.positionButtons.forEach((button) => {
        const active = state.position !== 'custom' && button.dataset.position === state.position;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    updateUploadControls();
}

function setPosition(position) {
    state.position = position;
    resetPositionForPreset();
    updateSettingControls();
    renderPreview();
}

function pointInWatermark(point, geometry) {
    if (!geometry) return false;
    const deltaX = point.x - geometry.centerX;
    const deltaY = point.y - geometry.centerY;
    const radians = -geometry.rotation * Math.PI / 180;
    const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
    const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
    return Math.abs(localX) <= geometry.width / 2 && Math.abs(localY) <= geometry.height / 2;
}

function getPointerInImage(event) {
    if (!state.imageRect || !state.sourceImage) return null;
    const bounds = elements.canvas.getBoundingClientRect();
    return {
        x: (event.clientX - bounds.left - state.imageRect.x) / state.imageRect.scale,
        y: (event.clientY - bounds.top - state.imageRect.y) / state.imageRect.scale
    };
}

function handlePointerDown(event) {
    if (!state.sourceImage || state.pointerDrag || !hasWatermarkContent()) return;
    const point = getPointerInImage(event);
    if (!point) return;
    const geometry = calculateWatermarkGeometry(
        state.sourceImage.naturalWidth,
        state.sourceImage.naturalHeight,
        getWatermarkSettings()
    );
    if (!pointInWatermark(point, geometry)) return;
    state.pointerDrag = { pointerId: event.pointerId };
    elements.canvas.setPointerCapture(event.pointerId);
    elements.canvas.classList.add('is-dragging');
    event.preventDefault();
}

function handlePointerMove(event) {
    if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId || !state.sourceImage) return;
    const point = getPointerInImage(event);
    if (!point) return;
    state.position = 'custom';
    state.xNorm = point.x / state.sourceImage.naturalWidth;
    state.yNorm = point.y / state.sourceImage.naturalHeight;
    const geometry = calculateWatermarkGeometry(
        state.sourceImage.naturalWidth,
        state.sourceImage.naturalHeight,
        getWatermarkSettings()
    );
    if (geometry) {
        state.xNorm = geometry.centerX / state.sourceImage.naturalWidth;
        state.yNorm = geometry.centerY / state.sourceImage.naturalHeight;
    }
    updateSettingControls();
    renderPreview();
}

function handlePointerUp(event) {
    if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId) return;
    state.pointerDrag = null;
    elements.canvas.classList.remove('is-dragging');
    if (elements.canvas.hasPointerCapture(event.pointerId)) {
        elements.canvas.releasePointerCapture(event.pointerId);
    }
}

function setKind(kind) {
    if (state.kind === kind) return;
    state.kind = kind;
    state.watermarkError = '';
    showError(elements.watermarkError, '');
    updateSettingControls();
    renderPreview();
}

function setColor(color) {
    state.color = color;
    elements.colorInput.value = color;
    elements.colorButtons.forEach((button) => {
        const active = button.dataset.color === color;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    renderPreview();
}

function resetWatermarkSettings() {
    state.text = 'PIX';
    state.color = '#ffffff';
    state.weight = 'bold';
    state.position = 'bottom-right';
    state.xNorm = 0.5;
    state.yNorm = 0.5;
    state.size = 40;
    state.opacity = 70;
    state.rotation = 0;
    state.edgeMargin = 24;
    elements.textInput.value = state.text;
    elements.weightButtons.forEach((button) => {
        const active = button.dataset.weight === state.weight;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    setColor(state.color);
    if (state.sourceImage) resetPositionForPreset();
    updateSettingControls();
    renderPreview();
}

function canvasToBlob(canvas, format, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('이미지 생성에 실패했습니다.'));
        }, format, quality);
    });
}

async function exportImage() {
    if (elements.saveButton.disabled || state.isExporting) return;
    const settings = getWatermarkSettings();
    const snapshot = {
        sourceImage: state.sourceImage,
        settings: { ...settings },
        format: state.format,
        fileName: `${state.sourceFileNameBase}_워터마크.${state.format === 'image/jpeg' ? 'jpg' : 'png'}`
    };
    if (!snapshot.sourceImage
        || (snapshot.settings.kind === 'text' && !snapshot.settings.text.trim())
        || (snapshot.settings.kind === 'image' && !snapshot.settings.image)) {
        return;
    }

    state.isExporting = true;
    showError(elements.exportError, '');
    updateSaveButton();
    try {
        const width = snapshot.sourceImage.naturalWidth;
        const height = snapshot.sourceImage.naturalHeight;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;
        const exportContext = exportCanvas.getContext('2d');
        if (!exportContext) throw new Error('저장 이미지를 준비하지 못했습니다.');
        if (snapshot.format === 'image/jpeg') {
            exportContext.fillStyle = '#ffffff';
            exportContext.fillRect(0, 0, width, height);
        }
        exportContext.drawImage(snapshot.sourceImage, 0, 0, width, height);
        const geometry = calculateWatermarkGeometry(width, height, snapshot.settings);
        if (geometry) {
            drawWatermark(exportContext, geometry, geometry.centerX, geometry.centerY, 1, false);
        }
        const blob = await canvasToBlob(
            exportCanvas,
            snapshot.format,
            snapshot.format === 'image/jpeg' ? 0.95 : undefined
        );
        const url = URL.createObjectURL(blob);
        state.exportUrls.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = snapshot.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => {
            URL.revokeObjectURL(url);
            state.exportUrls.delete(url);
        }, 1000);
    } catch (error) {
        showError(elements.exportError, error.message || '사진 저장에 실패했습니다.');
    } finally {
        state.isExporting = false;
        updateSaveButton();
    }
}

function bindUploadEvents(input, box, processFile) {
    input.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        processFile(file);
    });
    box.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!input.disabled) box.classList.add('is-dragover');
    });
    box.addEventListener('dragleave', (event) => {
        if (!box.contains(event.relatedTarget)) box.classList.remove('is-dragover');
    });
    box.addEventListener('drop', (event) => {
        event.preventDefault();
        box.classList.remove('is-dragover');
        if (!input.disabled) processFile(event.dataTransfer.files[0]);
    });
}

function bindEvents() {
    bindUploadEvents(elements.sourceInput, elements.sourceUploadBox, processSourceFile);
    bindUploadEvents(elements.watermarkInput, elements.watermarkUploadBox, processWatermarkFile);

    elements.kindButtons.forEach((button) => {
        button.addEventListener('click', () => setKind(button.dataset.kind));
    });
    elements.textInput.addEventListener('input', () => {
        state.text = elements.textInput.value.replace(/[\r\n]+/g, '').slice(0, 50);
        elements.textInput.value = state.text;
        state.sourceError = '';
        showError(elements.exportError, '');
        renderPreview();
    });
    elements.colorButtons.forEach((button) => {
        button.addEventListener('click', () => setColor(button.dataset.color));
    });
    elements.colorInput.addEventListener('input', () => setColor(elements.colorInput.value));
    elements.weightButtons.forEach((button) => {
        button.addEventListener('click', () => {
            state.weight = button.dataset.weight;
            elements.weightButtons.forEach((item) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            renderPreview();
        });
    });
    elements.positionButtons.forEach((button) => {
        button.addEventListener('click', () => setPosition(button.dataset.position));
    });
    elements.sizeInput.addEventListener('input', () => {
        state.size = Number(elements.sizeInput.value);
        updateSettingControls();
        renderPreview();
    });
    elements.opacityInput.addEventListener('input', () => {
        state.opacity = Number(elements.opacityInput.value);
        updateSettingControls();
        renderPreview();
    });
    elements.marginInput.addEventListener('input', () => {
        state.edgeMargin = Number(elements.marginInput.value);
        updateSettingControls();
        renderPreview();
    });
    elements.rotationInput.addEventListener('input', () => {
        state.rotation = Number(elements.rotationInput.value);
        if (state.position !== 'custom' && state.sourceImage) resetPositionForPreset();
        updateSettingControls();
        renderPreview();
    });
    elements.formatButtons.forEach((button) => {
        button.addEventListener('click', () => {
            state.format = button.dataset.format;
            showError(elements.exportError, '');
            updateSettingControls();
        });
    });
    elements.deleteWatermark.addEventListener('click', () => {
        if (state.watermarkUrl) URL.revokeObjectURL(state.watermarkUrl);
        state.watermarkImage = null;
        state.watermarkUrl = '';
        state.watermarkFileName = '';
        state.watermarkError = '';
        elements.watermarkFileName.textContent = '워터마크 이미지 없음';
        showError(elements.watermarkError, '');
        elements.watermarkInput.value = '';
        renderPreview();
        updateUploadControls();
    });
    elements.resetButton.addEventListener('click', resetWatermarkSettings);
    elements.saveButton.addEventListener('click', exportImage);
    elements.canvas.addEventListener('pointerdown', handlePointerDown);
    elements.canvas.addEventListener('pointermove', handlePointerMove);
    elements.canvas.addEventListener('pointerup', handlePointerUp);
    elements.canvas.addEventListener('pointercancel', handlePointerUp);

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => renderPreview()).observe(elements.previewStage);
    } else {
        window.addEventListener('resize', renderPreview);
    }

    window.addEventListener('pagehide', () => {
        if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
        if (state.watermarkUrl) URL.revokeObjectURL(state.watermarkUrl);
        state.exportUrls.forEach((url) => URL.revokeObjectURL(url));
        state.exportUrls.clear();
    });
}

bindEvents();
updateSettingControls();
renderPreview();
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(renderPreview);
}
