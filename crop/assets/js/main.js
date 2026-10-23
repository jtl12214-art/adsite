const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;
const HANDLE_NAMES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const FIXED_RATIOS = {
    '1:1': 1,
    '4:5': 4 / 5,
    '3:4': 3 / 4,
    '9:16': 9 / 16,
    '16:9': 16 / 9
};

const elements = {
    uploadBox: document.getElementById('upload-box'),
    fileInput: document.getElementById('image-input'),
    selectButton: document.getElementById('select-image-button'),
    fileName: document.getElementById('file-name'),
    uploadError: document.getElementById('upload-error'),
    ratioOptions: document.getElementById('ratio-options'),
    rotateLeft: document.getElementById('rotate-left'),
    rotateRight: document.getElementById('rotate-right'),
    resetButton: document.getElementById('reset-button'),
    rotationValue: document.getElementById('rotation-value'),
    cropDimensions: document.getElementById('crop-dimensions'),
    formatButtons: document.querySelectorAll('.format-button'),
    jpegNotice: document.getElementById('jpeg-notice'),
    saveButton: document.getElementById('save-button'),
    previewStage: document.getElementById('preview-stage'),
    caption: document.getElementById('preview-caption'),
    emptyPreview: document.getElementById('empty-preview'),
    canvas: document.getElementById('crop-canvas')
};
const context = elements.canvas.getContext('2d');
if (!context) {
    throw new Error('Canvas를 초기화할 수 없습니다.');
}

const state = {
    image: null,
    sourceUrl: '',
    fileName: '',
    fileNameBase: '',
    orientedCanvas: null,
    rotation: 0,
    ratio: 'free',
    crop: null,
    format: 'image/png',
    isProcessing: false,
    isExporting: false,
    uploadRequestId: 0,
    renderRequestId: 0,
    pointerDrag: null,
    imageRect: null,
    renderError: false
};

function showError(message) {
    elements.uploadError.textContent = message;
}

function updateSaveButton() {
    elements.saveButton.disabled = !state.image || !state.crop || state.isProcessing
        || state.isExporting || state.renderError;
}

function getCurrentRatio() {
    if (state.ratio === 'free') return null;
    if (state.ratio === 'original') {
        return state.orientedCanvas.width / state.orientedCanvas.height;
    }
    return FIXED_RATIOS[state.ratio];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getFullCrop() {
    return {
        x: 0,
        y: 0,
        width: state.orientedCanvas.width,
        height: state.orientedCanvas.height
    };
}

function getLargestCenteredCrop(aspectRatio) {
    const imageWidth = state.orientedCanvas.width;
    const imageHeight = state.orientedCanvas.height;
    let width = imageWidth;
    let height = width / aspectRatio;
    if (height > imageHeight) {
        height = imageHeight;
        width = height * aspectRatio;
    }
    width = Math.max(1, Math.min(imageWidth, Math.round(width)));
    height = Math.max(1, Math.min(imageHeight, Math.round(width / aspectRatio)));
    if (height > imageHeight) {
        height = imageHeight;
        width = Math.max(1, Math.round(height * aspectRatio));
    }
    return {
        x: Math.round((imageWidth - width) / 2),
        y: Math.round((imageHeight - height) / 2),
        width,
        height
    };
}

function resetCropForRatio() {
    const aspectRatio = getCurrentRatio();
    state.crop = aspectRatio ? getLargestCenteredCrop(aspectRatio) : getFullCrop();
}

function createOrientedCanvas() {
    const sourceWidth = state.image.naturalWidth;
    const sourceHeight = state.image.naturalHeight;
    const swapsDimensions = state.rotation === 90 || state.rotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swapsDimensions ? sourceHeight : sourceWidth;
    canvas.height = swapsDimensions ? sourceWidth : sourceHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('회전 이미지를 생성하지 못했습니다.');

    if (state.rotation === 0) {
        ctx.drawImage(state.image, 0, 0);
    } else if (state.rotation === 90) {
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(state.image, 0, 0);
    } else if (state.rotation === 180) {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
        ctx.drawImage(state.image, 0, 0);
    } else {
        ctx.translate(0, canvas.height);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(state.image, 0, 0);
    }
    return canvas;
}

function updateCropInfo() {
    if (!state.crop) {
        elements.cropDimensions.textContent = '— × — px';
        return;
    }
    elements.cropDimensions.textContent = `${state.crop.width} × ${state.crop.height} px`;
}

function updateControls() {
    elements.rotateLeft.disabled = !state.image || state.isProcessing;
    elements.rotateRight.disabled = !state.image || state.isProcessing;
    elements.resetButton.disabled = !state.image || state.isProcessing;
    elements.rotationValue.textContent = `회전: ${state.rotation}°`;
    elements.emptyPreview.hidden = Boolean(state.image);
    elements.caption.textContent = state.image
        ? `${state.fileName} · ${state.orientedCanvas.width} × ${state.orientedCanvas.height} px`
        : '이미지를 업로드하면 자르기 영역을 조정할 수 있습니다.';
    updateCropInfo();
    updateSaveButton();
}

function renderRatioButtons() {
    const ratios = [
        { value: 'free', label: '자유' },
        { value: 'original', label: '원본' },
        { value: '1:1', label: '1:1' },
        { value: '4:5', label: '4:5' },
        { value: '3:4', label: '3:4' },
        { value: '9:16', label: '9:16' },
        { value: '16:9', label: '16:9' }
    ];
    elements.ratioOptions.replaceChildren();
    ratios.forEach((ratio) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ratio-button${state.ratio === ratio.value ? ' is-active' : ''}`;
        button.textContent = ratio.label;
        button.dataset.ratio = ratio.value;
        button.setAttribute('aria-pressed', String(state.ratio === ratio.value));
        button.disabled = !state.image;
        button.addEventListener('click', () => {
            if (state.ratio === ratio.value || !state.image) return;
            state.ratio = ratio.value;
            resetCropForRatio();
            renderRatioButtons();
            renderPreview();
        });
        elements.ratioOptions.appendChild(button);
    });
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

function getHandlePoints(rect) {
    return {
        n: { x: rect.x + rect.width / 2, y: rect.y },
        ne: { x: rect.x + rect.width, y: rect.y },
        e: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
        se: { x: rect.x + rect.width, y: rect.y + rect.height },
        s: { x: rect.x + rect.width / 2, y: rect.y + rect.height },
        sw: { x: rect.x, y: rect.y + rect.height },
        w: { x: rect.x, y: rect.y + rect.height / 2 },
        nw: { x: rect.x, y: rect.y }
    };
}

function renderPreview() {
    const requestId = ++state.renderRequestId;
    state.renderError = false;

    if (!state.orientedCanvas || !state.crop) {
        elements.canvas.width = 1;
        elements.canvas.height = 1;
        elements.canvas.style.width = '100%';
        elements.canvas.style.height = '100%';
        elements.canvas.classList.remove('is-interactive', 'is-dragging');
        state.imageRect = null;
        updateControls();
        return;
    }

    try {
        const available = getPreviewDimensions();
        const sourceWidth = state.orientedCanvas.width;
        const sourceHeight = state.orientedCanvas.height;
        const scale = Math.min(available.width / sourceWidth, available.height / sourceHeight);
        const displayWidth = Math.max(1, sourceWidth * scale);
        const displayHeight = Math.max(1, sourceHeight * scale);
        const offsetX = (available.width - displayWidth) / 2;
        const offsetY = (available.height - displayHeight) / 2;
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        elements.canvas.style.width = `${available.width}px`;
        elements.canvas.style.height = `${available.height}px`;
        elements.canvas.width = Math.max(1, Math.round(available.width * dpr));
        elements.canvas.height = Math.max(1, Math.round(available.height * dpr));
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, available.width, available.height);
        context.fillStyle = '#EDEAE6';
        context.fillRect(0, 0, available.width, available.height);

        state.imageRect = {
            x: offsetX,
            y: offsetY,
            width: displayWidth,
            height: displayHeight,
            scale
        };
        context.drawImage(state.orientedCanvas, offsetX, offsetY, displayWidth, displayHeight);
        drawCropOverlay();
        elements.canvas.classList.add('is-interactive');
        elements.canvas.setAttribute('aria-label', `편집 이미지 ${sourceWidth} × ${sourceHeight} 픽셀, 자르기 영역 ${state.crop.width} × ${state.crop.height} 픽셀`);
    } catch (error) {
        if (requestId === state.renderRequestId) {
            state.renderError = true;
            showError(error.message || '미리보기를 표시하지 못했습니다.');
        }
    }
    updateControls();
}

function drawCropOverlay() {
    const imageRect = state.imageRect;
    const crop = state.crop;
    const scale = imageRect.scale;
    const cropRect = {
        x: imageRect.x + crop.x * scale,
        y: imageRect.y + crop.y * scale,
        width: crop.width * scale,
        height: crop.height * scale
    };

    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(imageRect.x, imageRect.y, imageRect.width, cropRect.y - imageRect.y);
    context.fillRect(imageRect.x, cropRect.y + cropRect.height, imageRect.width, imageRect.y + imageRect.height - cropRect.y - cropRect.height);
    context.fillRect(imageRect.x, cropRect.y, cropRect.x - imageRect.x, cropRect.height);
    context.fillRect(cropRect.x + cropRect.width, cropRect.y, imageRect.x + imageRect.width - cropRect.x - cropRect.width, cropRect.height);

    context.save();
    context.beginPath();
    context.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    context.clip();
    context.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    context.lineWidth = 1;
    for (let division = 1; division < 3; division += 1) {
        const x = cropRect.x + (cropRect.width * division) / 3;
        const y = cropRect.y + (cropRect.height * division) / 3;
        context.beginPath();
        context.moveTo(x, cropRect.y);
        context.lineTo(x, cropRect.y + cropRect.height);
        context.moveTo(cropRect.x, y);
        context.lineTo(cropRect.x + cropRect.width, y);
        context.stroke();
    }
    context.restore();

    context.strokeStyle = '#FF7A0B';
    context.lineWidth = 2;
    context.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

    const handlePoints = getHandlePoints(cropRect);
    const size = 8;
    HANDLE_NAMES.forEach((name) => {
        const point = handlePoints[name];
        context.fillStyle = '#FFFFFF';
        context.strokeStyle = '#C55200';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });
}

function getPointerInImage(event) {
    if (!state.imageRect) return null;
    const bounds = elements.canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left - state.imageRect.x;
    const y = event.clientY - bounds.top - state.imageRect.y;
    return { x: x / state.imageRect.scale, y: y / state.imageRect.scale };
}

function getHandleAt(point) {
    const imageRect = state.imageRect;
    const cropRect = {
        x: imageRect.x + state.crop.x * imageRect.scale,
        y: imageRect.y + state.crop.y * imageRect.scale,
        width: state.crop.width * imageRect.scale,
        height: state.crop.height * imageRect.scale
    };
    const handles = getHandlePoints(cropRect);
    const bounds = elements.canvas.getBoundingClientRect();
    const local = {
        x: point.x * imageRect.scale + imageRect.x,
        y: point.y * imageRect.scale + imageRect.y
    };
    const hitRadius = 14;
    for (const handleName of HANDLE_NAMES) {
        const handle = handles[handleName];
        if (Math.hypot(local.x - handle.x, local.y - handle.y) <= hitRadius) return handleName;
    }
    return null;
}

function isInsideCrop(point) {
    return point.x >= state.crop.x && point.x <= state.crop.x + state.crop.width
        && point.y >= state.crop.y && point.y <= state.crop.y + state.crop.height;
}

function getHandleSides(handle) {
    return {
        left: handle.includes('w'),
        right: handle.includes('e'),
        top: handle.includes('n'),
        bottom: handle.includes('s')
    };
}

function resizeFreeCrop(start, point, sides, minimum) {
    let left = start.x;
    let right = start.x + start.width;
    let top = start.y;
    let bottom = start.y + start.height;
    if (sides.left) left = clamp(point.x, 0, right - minimum);
    if (sides.right) right = clamp(point.x, left + minimum, state.orientedCanvas.width);
    if (sides.top) top = clamp(point.y, 0, bottom - minimum);
    if (sides.bottom) bottom = clamp(point.y, top + minimum, state.orientedCanvas.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function resizeFixedCrop(start, point, sides, ratio, minimum) {
    const horizontal = sides.left || sides.right;
    const vertical = sides.top || sides.bottom;
    const anchorX = sides.left ? start.x + start.width : (sides.right ? start.x : start.x + start.width / 2);
    const anchorY = sides.top ? start.y + start.height : (sides.bottom ? start.y : start.y + start.height / 2);
    const widthFromPointer = horizontal ? Math.abs(point.x - anchorX) : 0;
    const heightFromPointer = vertical ? Math.abs(point.y - anchorY) : 0;
    let width;
    if (horizontal && vertical) {
        width = Math.abs(widthFromPointer - start.width) >= Math.abs(heightFromPointer - start.height) * ratio
            ? widthFromPointer
            : heightFromPointer * ratio;
    } else if (horizontal) {
        width = widthFromPointer;
    } else {
        width = heightFromPointer * ratio;
    }

    let maxWidth = state.orientedCanvas.width;
    let maxHeight = state.orientedCanvas.height;
    if (sides.left) maxWidth = anchorX;
    if (sides.right) maxWidth = state.orientedCanvas.width - anchorX;
    if (!horizontal) maxWidth = 2 * Math.min(anchorX, state.orientedCanvas.width - anchorX);
    if (sides.top) maxHeight = anchorY;
    if (sides.bottom) maxHeight = state.orientedCanvas.height - anchorY;
    if (!vertical) maxHeight = 2 * Math.min(anchorY, state.orientedCanvas.height - anchorY);

    width = Math.min(width, maxWidth, maxHeight * ratio);
    width = Math.max(Math.min(minimum, maxWidth, maxHeight * ratio), width);
    const height = width / ratio;
    const x = sides.left ? anchorX - width : (sides.right ? anchorX : anchorX - width / 2);
    const y = sides.top ? anchorY - height : (sides.bottom ? anchorY : anchorY - height / 2);
    return { x, y, width, height };
}

function handlePointerDown(event) {
    if (!state.image || !state.crop || state.isProcessing) return;
    const point = getPointerInImage(event);
    if (!point || point.x < 0 || point.y < 0
        || point.x > state.orientedCanvas.width || point.y > state.orientedCanvas.height) return;

    const handle = getHandleAt(point);
    const moveCrop = !handle && isInsideCrop(point);
    if (!handle && !moveCrop) return;

    state.pointerDrag = {
        pointerId: event.pointerId,
        handle,
        moveCrop,
        startPoint: point,
        startCrop: { ...state.crop },
        minimum: 40 / state.imageRect.scale
    };
    elements.canvas.setPointerCapture(event.pointerId);
    elements.canvas.classList.add('is-dragging');
    event.preventDefault();
}

function handlePointerMove(event) {
    if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId) return;
    const point = getPointerInImage(event);
    if (!point) return;
    const drag = state.pointerDrag;
    const deltaX = point.x - drag.startPoint.x;
    const deltaY = point.y - drag.startPoint.y;

    if (drag.moveCrop) {
        state.crop.x = clamp(drag.startCrop.x + deltaX, 0, state.orientedCanvas.width - drag.startCrop.width);
        state.crop.y = clamp(drag.startCrop.y + deltaY, 0, state.orientedCanvas.height - drag.startCrop.height);
    } else {
        const sides = getHandleSides(drag.handle);
        const ratio = getCurrentRatio();
        const nextCrop = ratio
            ? resizeFixedCrop(drag.startCrop, point, sides, ratio, drag.minimum)
            : resizeFreeCrop(drag.startCrop, point, sides, drag.minimum);
        state.crop = {
            x: Math.round(nextCrop.x),
            y: Math.round(nextCrop.y),
            width: Math.max(1, Math.round(nextCrop.width)),
            height: Math.max(1, Math.round(nextCrop.height))
        };
        if (ratio) {
            const actualRatio = state.crop.width / state.crop.height;
            if (Math.abs(actualRatio - ratio) > 0.01) {
                state.crop.height = Math.max(1, Math.round(state.crop.width / ratio));
            }
        }
        state.crop.x = clamp(state.crop.x, 0, state.orientedCanvas.width - state.crop.width);
        state.crop.y = clamp(state.crop.y, 0, state.orientedCanvas.height - state.crop.height);
    }
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

function parseImageSignature(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return null;
}

function decodeImage(file, requestId) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => resolve({ image, objectUrl, requestId });
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('지원하지 않는 이미지 형식입니다.'));
        };
        image.src = objectUrl;
    });
}

function sanitizeFilename(fileName) {
    return String(fileName || 'image')
        .replace(/\.[^/.]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim() || 'image';
}

async function processFile(file) {
    if (!file || state.isProcessing) return;
    const requestId = ++state.uploadRequestId;
    state.isProcessing = true;
    state.renderError = false;
    state.pointerDrag = null;
    if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    state.image = null;
    state.sourceUrl = '';
    state.fileName = '';
    state.fileNameBase = '';
    state.orientedCanvas = null;
    state.rotation = 0;
    state.ratio = 'free';
    state.crop = null;
    elements.fileInput.disabled = true;
    elements.selectButton.disabled = true;
    elements.uploadBox.classList.add('is-processing');
    showError('');
    renderRatioButtons();
    renderPreview();
    updateControls();

    try {
        if (file.size > MAX_FILE_SIZE) {
            throw new Error('20MB 이하의 이미지를 선택해주세요.');
        }
        const buffer = await file.arrayBuffer();
        if (!parseImageSignature(buffer)) {
            throw new Error('지원하지 않는 이미지 형식입니다.');
        }
        const decoded = await decodeImage(file, requestId);
        if (requestId !== state.uploadRequestId) {
            URL.revokeObjectURL(decoded.objectUrl);
            return;
        }
        if (decoded.image.naturalWidth * decoded.image.naturalHeight > MAX_PIXEL_COUNT) {
            URL.revokeObjectURL(decoded.objectUrl);
            throw new Error('이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
        }

        state.image = decoded.image;
        state.sourceUrl = decoded.objectUrl;
        state.fileName = file.name;
        state.fileNameBase = sanitizeFilename(file.name);
        state.orientedCanvas = createOrientedCanvas();
        state.crop = getFullCrop();
        elements.fileName.textContent = file.name;
        showError('');
        renderRatioButtons();
        renderPreview();
    } catch (error) {
        if (requestId === state.uploadRequestId) {
            if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
            state.image = null;
            state.sourceUrl = '';
            state.orientedCanvas = null;
            state.crop = null;
            elements.fileName.textContent = '선택된 파일 없음';
            renderRatioButtons();
            renderPreview();
            showError(error.message || '이미지를 불러오지 못했습니다.');
        }
    } finally {
        if (requestId === state.uploadRequestId) {
            state.isProcessing = false;
            elements.fileInput.disabled = false;
            elements.selectButton.disabled = false;
            elements.uploadBox.classList.remove('is-processing');
            elements.fileInput.value = '';
            updateControls();
        }
    }
}

function rotate(degrees) {
    if (!state.image || state.isProcessing) return;
    state.rotation = (state.rotation + degrees + 360) % 360;
    state.orientedCanvas = createOrientedCanvas();
    resetCropForRatio();
    showError('');
    renderPreview();
}

function resetEditor() {
    if (!state.image || state.isProcessing) return;
    state.rotation = 0;
    state.ratio = 'free';
    state.orientedCanvas = createOrientedCanvas();
    state.crop = getFullCrop();
    renderRatioButtons();
    showError('');
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
    if (elements.saveButton.disabled || state.isExporting || !state.image || !state.crop) return;
    state.isExporting = true;
    updateSaveButton();

    const snapshot = {
        image: state.image,
        rotation: state.rotation,
        ratio: state.ratio,
        crop: { ...state.crop },
        orientedCanvas: state.orientedCanvas,
        format: state.format,
        fileName: `${state.fileNameBase}_자르기.${state.format === 'image/jpeg' ? 'jpg' : 'png'}`
    };

    try {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = snapshot.crop.width;
        exportCanvas.height = snapshot.crop.height;
        const exportContext = exportCanvas.getContext('2d');
        if (!exportContext) throw new Error('저장 Canvas를 초기화할 수 없습니다.');
        if (snapshot.format === 'image/jpeg') {
            exportContext.fillStyle = '#ffffff';
            exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        }
        exportContext.drawImage(
            snapshot.orientedCanvas,
            snapshot.crop.x,
            snapshot.crop.y,
            snapshot.crop.width,
            snapshot.crop.height,
            0,
            0,
            snapshot.crop.width,
            snapshot.crop.height
        );
        const blob = await canvasToBlob(
            exportCanvas,
            snapshot.format,
            snapshot.format === 'image/jpeg' ? 0.95 : undefined
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = snapshot.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showError('');
    } catch (error) {
        showError(error.message || '사진 저장에 실패했습니다.');
    } finally {
        state.isExporting = false;
        updateSaveButton();
    }
}

function bindEvents() {
    elements.selectButton.addEventListener('click', () => {
        if (!state.isProcessing) elements.fileInput.click();
    });
    elements.fileInput.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        processFile(file);
    });
    elements.uploadBox.addEventListener('click', (event) => {
        if (event.target === elements.uploadBox && !state.isProcessing) elements.fileInput.click();
    });
    elements.uploadBox.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === elements.uploadBox) {
            event.preventDefault();
            elements.fileInput.click();
        }
    });
    elements.uploadBox.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!state.isProcessing) elements.uploadBox.classList.add('is-dragover');
    });
    elements.uploadBox.addEventListener('dragleave', () => elements.uploadBox.classList.remove('is-dragover'));
    elements.uploadBox.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.uploadBox.classList.remove('is-dragover');
        if (!state.isProcessing) {
            const [file] = event.dataTransfer.files || [];
            processFile(file);
        }
    });

    elements.canvas.addEventListener('pointerdown', handlePointerDown);
    elements.canvas.addEventListener('pointermove', handlePointerMove);
    elements.canvas.addEventListener('pointerup', handlePointerUp);
    elements.canvas.addEventListener('pointercancel', handlePointerUp);
    elements.rotateLeft.addEventListener('click', () => rotate(-90));
    elements.rotateRight.addEventListener('click', () => rotate(90));
    elements.resetButton.addEventListener('click', resetEditor);
    elements.formatButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (state.format === button.dataset.format) return;
            state.format = button.dataset.format;
            elements.formatButtons.forEach((item) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            elements.jpegNotice.hidden = state.format !== 'image/jpeg';
        });
    });
    elements.saveButton.addEventListener('click', exportImage);

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => renderPreview()).observe(elements.previewStage);
    } else {
        window.addEventListener('resize', renderPreview);
    }
    window.addEventListener('pagehide', () => {
        if (state.sourceUrl) URL.revokeObjectURL(state.sourceUrl);
    });
}

bindEvents();
renderRatioButtons();
renderPreview();
