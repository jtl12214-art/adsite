const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;
const MAX_PHOTOS = 6;
const OUTPUT_LONG_SIDE = 2000;

const TEMPLATES = [
    { id: '2-01', count: 2, label: '좌우', frames: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
    { id: '2-02', count: 2, label: '상하', frames: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
    { id: '2-03', count: 2, label: '큰 사진 왼쪽', frames: [{ x: 0, y: 0, w: 0.65, h: 1 }, { x: 0.65, y: 0, w: 0.35, h: 1 }] },
    { id: '2-04', count: 2, label: '큰 사진 위쪽', frames: [{ x: 0, y: 0, w: 1, h: 0.65 }, { x: 0, y: 0.65, w: 1, h: 0.35 }] },
    { id: '3-01', count: 3, label: '가로 3열', frames: gridFrames(3, 1) },
    { id: '3-02', count: 3, label: '세로 3행', frames: gridFrames(1, 3) },
    { id: '3-03', count: 3, label: '큰 사진 왼쪽', frames: [{ x: 0, y: 0, w: 0.65, h: 1 }, { x: 0.65, y: 0, w: 0.35, h: 0.5 }, { x: 0.65, y: 0.5, w: 0.35, h: 0.5 }] },
    { id: '3-04', count: 3, label: '큰 사진 위쪽', frames: [{ x: 0, y: 0, w: 1, h: 0.65 }, { x: 0, y: 0.65, w: 0.5, h: 0.35 }, { x: 0.5, y: 0.65, w: 0.5, h: 0.35 }] },
    { id: '3-05', count: 3, label: '큰 사진 오른쪽', frames: [{ x: 0, y: 0, w: 0.35, h: 0.5 }, { x: 0, y: 0.5, w: 0.35, h: 0.5 }, { x: 0.35, y: 0, w: 0.65, h: 1 }] },
    { id: '3-06', count: 3, label: '큰 사진 아래쪽', frames: [{ x: 0, y: 0, w: 0.5, h: 0.35 }, { x: 0.5, y: 0, w: 0.5, h: 0.35 }, { x: 0, y: 0.35, w: 1, h: 0.65 }] },
    { id: '4-01', count: 4, label: '2×2', frames: gridFrames(2, 2) },
    { id: '4-02', count: 4, label: '가로 4열', frames: gridFrames(4, 1) },
    { id: '4-03', count: 4, label: '세로 4행', frames: gridFrames(1, 4) },
    { id: '4-04', count: 4, label: '큰 사진 왼쪽', frames: [{ x: 0, y: 0, w: 0.65, h: 1 }, ...gridFrames(1, 3, 0.65, 0, 0.35, 1)] },
    { id: '4-05', count: 4, label: '큰 사진 위쪽', frames: [{ x: 0, y: 0, w: 1, h: 0.65 }, ...gridFrames(3, 1, 0, 0.65, 1, 0.35)] },
    { id: '4-06', count: 4, label: '큰 사진 오른쪽', frames: [...gridFrames(1, 3, 0, 0, 0.35, 1), { x: 0.35, y: 0, w: 0.65, h: 1 }] },
    { id: '4-07', count: 4, label: '큰 사진 아래쪽', frames: [...gridFrames(3, 1, 0, 0, 1, 0.35), { x: 0, y: 0.35, w: 1, h: 0.65 }] },
    { id: '5-01', count: 5, label: '위 2 · 아래 3', frames: [...gridFrames(2, 1, 0, 0, 1, 0.5), ...gridFrames(3, 1, 0, 0.5, 1, 0.5)] },
    { id: '5-02', count: 5, label: '위 3 · 아래 2', frames: [...gridFrames(3, 1, 0, 0, 1, 0.5), ...gridFrames(2, 1, 0, 0.5, 1, 0.5)] },
    { id: '5-03', count: 5, label: '큰 사진 왼쪽', frames: [{ x: 0, y: 0, w: 0.6, h: 1 }, ...gridFrames(2, 2, 0.6, 0, 0.4, 1)] },
    { id: '5-04', count: 5, label: '큰 사진 오른쪽', frames: [...gridFrames(2, 2, 0, 0, 0.4, 1), { x: 0.4, y: 0, w: 0.6, h: 1 }] },
    { id: '5-05', count: 5, label: '큰 사진 위쪽', frames: [{ x: 0, y: 0, w: 1, h: 0.62 }, ...gridFrames(4, 1, 0, 0.62, 1, 0.38)] },
    { id: '6-01', count: 6, label: '3×2', frames: gridFrames(3, 2) },
    { id: '6-02', count: 6, label: '2×3', frames: gridFrames(2, 3) },
    { id: '6-03', count: 6, label: '왼쪽 크게', frames: [...gridFrames(1, 2, 0, 0, 0.62, 1), ...gridFrames(2, 2, 0.62, 0, 0.38, 1)] },
    { id: '6-04', count: 6, label: '위쪽 크게', frames: [...gridFrames(2, 1, 0, 0, 1, 0.62), ...gridFrames(2, 2, 0, 0.62, 1, 0.38)] }
];

const RATIOS = [
    { id: '1:1', width: 2000, height: 2000 },
    { id: '4:5', width: 1600, height: 2000 },
    { id: '3:4', width: 1500, height: 2000 },
    { id: '9:16', width: 1125, height: 2000 },
    { id: '16:9', width: 2000, height: 1125 }
];

const elements = {
    uploadBox: document.getElementById('upload-box'),
    fileInput: document.getElementById('image-input'),
    selectButton: document.getElementById('select-image-button'),
    uploadError: document.getElementById('upload-error'),
    photoList: document.getElementById('photo-list'),
    templateTabs: document.getElementById('template-tabs'),
    templateGrid: document.getElementById('template-grid'),
    ratioOptions: document.getElementById('ratio-options'),
    zoomSlider: document.getElementById('zoom-slider'),
    zoomValue: document.getElementById('zoom-value'),
    marginSlider: document.getElementById('margin-slider'),
    marginValue: document.getElementById('margin-value'),
    gapSlider: document.getElementById('gap-slider'),
    gapValue: document.getElementById('gap-value'),
    radiusSlider: document.getElementById('radius-slider'),
    radiusValue: document.getElementById('radius-value'),
    resetPosition: document.getElementById('reset-position-button'),
    selectedFrameLabel: document.getElementById('selected-frame-label'),
    backgroundColor: document.getElementById('background-color'),
    jpegNotice: document.getElementById('jpeg-notice'),
    saveButton: document.getElementById('save-button'),
    previewStage: document.getElementById('preview-stage'),
    canvas: document.getElementById('preview-canvas'),
    emptyPreview: document.getElementById('empty-preview'),
    previewDescription: document.getElementById('preview-description')
};
const context = elements.canvas.getContext('2d');
if (!context) {
    throw new Error('Canvas를 초기화할 수 없습니다.');
}

const state = {
    photos: [],
    templateCount: 4,
    templateId: '4-01',
    frames: [],
    selectedFrame: 0,
    ratioId: '1:1',
    format: 'image/png',
    margin: 20,
    gap: 12,
    radius: 16,
    background: '#ffffff',
    isProcessing: false,
    isExporting: false,
    renderRequestId: 0,
    renderError: false,
    pointerDrag: null,
    previewWidth: 0,
    previewHeight: 0
};

function gridFrames(columns, rows, x = 0, y = 0, width = 1, height = 1) {
    const frames = [];
    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            frames.push({
                x: x + (column / columns) * width,
                y: y + (row / rows) * height,
                w: width / columns,
                h: height / rows
            });
        }
    }
    return frames;
}

function validateTemplates() {
    if (TEMPLATES.length !== 26) {
        throw new Error(`템플릿 개수가 올바르지 않습니다: ${TEMPLATES.length}`);
    }
    TEMPLATES.forEach((template) => {
        if (template.frames.length !== template.count) {
            throw new Error(`${template.id} 템플릿의 Frame 개수가 올바르지 않습니다.`);
        }
        template.frames.forEach((frame) => {
            if (frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0
                || frame.x + frame.w > 1 || frame.y + frame.h > 1) {
                throw new Error(`${template.id} 템플릿의 Frame 좌표가 범위를 벗어났습니다.`);
            }
        });
        for (let index = 0; index < template.frames.length; index += 1) {
            for (let otherIndex = index + 1; otherIndex < template.frames.length; otherIndex += 1) {
                const frame = template.frames[index];
                const other = template.frames[otherIndex];
                const overlapWidth = Math.min(frame.x + frame.w, other.x + other.w) - Math.max(frame.x, other.x);
                const overlapHeight = Math.min(frame.y + frame.h, other.y + other.h) - Math.max(frame.y, other.y);
                if (overlapWidth > 0.000001 && overlapHeight > 0.000001) {
                    throw new Error(`${template.id} 템플릿의 Frame이 겹칩니다.`);
                }
            }
        }
    });
}

function getTemplate() {
    return TEMPLATES.find((template) => template.id === state.templateId);
}

function getRatio() {
    return RATIOS.find((ratio) => ratio.id === state.ratioId);
}

function getPhoto(photoId) {
    return state.photos.find((photo) => photo.id === photoId) || null;
}

function updateSaveButton() {
    const complete = state.frames.length > 0 && state.frames.every((frame) => frame.photoId && getPhoto(frame.photoId));
    elements.saveButton.disabled = !complete || state.isProcessing || state.isExporting || state.renderError;
}

function setUploadError(message) {
    elements.uploadError.textContent = message;
}

function createFrameStates(template, photos = state.photos) {
    return template.frames.map((frame, index) => ({
        photoId: photos[index] ? photos[index].id : null,
        zoom: 1,
        panX: 0,
        panY: 0
    }));
}

function renderTemplateTabs() {
    elements.templateTabs.replaceChildren();
    [2, 3, 4, 5, 6].forEach((count) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `template-tab${state.templateCount === count ? ' is-active' : ''}`;
        button.textContent = `${count}장`;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', String(state.templateCount === count));
        button.setAttribute('aria-pressed', String(state.templateCount === count));
        button.addEventListener('click', () => {
            if (state.templateCount === count) return;
            state.templateCount = count;
            const firstTemplate = TEMPLATES.find((template) => template.count === count);
            chooseTemplate(firstTemplate.id);
            renderTemplateTabs();
            renderTemplateGrid();
        });
        elements.templateTabs.appendChild(button);
    });
}

function renderTemplateGrid() {
    elements.templateGrid.replaceChildren();
    TEMPLATES.filter((template) => template.count === state.templateCount).forEach((template) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `template-option${template.id === state.templateId ? ' is-active' : ''}`;
        button.setAttribute('aria-pressed', String(template.id === state.templateId));
        button.setAttribute('aria-label', `${template.count}장 템플릿 ${template.label}`);

        const thumbnail = document.createElement('span');
        thumbnail.className = 'template-thumb';
        thumbnail.setAttribute('aria-hidden', 'true');
        template.frames.forEach((frame) => {
            const miniFrame = document.createElement('span');
            miniFrame.className = 'template-thumb-frame';
            miniFrame.style.left = `${frame.x * 100}%`;
            miniFrame.style.top = `${frame.y * 100}%`;
            miniFrame.style.width = `${frame.w * 100}%`;
            miniFrame.style.height = `${frame.h * 100}%`;
            thumbnail.appendChild(miniFrame);
        });

        const label = document.createElement('span');
        label.textContent = template.label;
        button.append(thumbnail, label);
        button.addEventListener('click', () => chooseTemplate(template.id));
        elements.templateGrid.appendChild(button);
    });
}

function renderRatios() {
    elements.ratioOptions.replaceChildren();
    RATIOS.forEach((ratio) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ratio-button${ratio.id === state.ratioId ? ' is-active' : ''}`;
        button.textContent = ratio.id;
        button.dataset.ratio = ratio.id;
        button.setAttribute('aria-pressed', String(ratio.id === state.ratioId));
        button.addEventListener('click', () => {
            if (state.ratioId === ratio.id) return;
            state.ratioId = ratio.id;
            renderRatios();
            resizeAndRender();
        });
        elements.ratioOptions.appendChild(button);
    });
}

function chooseTemplate(templateId) {
    if (state.templateId === templateId) return;
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    state.templateId = templateId;
    state.templateCount = template.count;
    state.frames = createFrameStates(template);
    state.selectedFrame = 0;
    updatePhotoControls();
    renderTemplateTabs();
    renderTemplateGrid();
    resizeAndRender();
}

function updatePhotoControls() {
    const frame = state.frames[state.selectedFrame];
    const zoom = frame ? Math.round(frame.zoom * 100) : 100;
    elements.zoomSlider.value = String(zoom);
    elements.zoomValue.value = `${zoom}%`;
    elements.selectedFrameLabel.textContent = `선택된 칸: ${String(state.selectedFrame + 1).padStart(2, '0')}`;
}

function renderPhotoList() {
    elements.photoList.replaceChildren();
    state.photos.forEach((photo) => {
        const item = document.createElement('div');
        item.className = 'photo-item';
        item.dataset.photoId = photo.id;
        item.draggable = true;
        item.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', photo.id);
            event.dataTransfer.effectAllowed = 'copy';
        });

        const thumbnail = document.createElement('img');
        thumbnail.src = photo.objectUrl;
        thumbnail.alt = '';
        thumbnail.width = 42;
        thumbnail.height = 38;

        const details = document.createElement('div');
        details.className = 'photo-details';
        const name = document.createElement('p');
        name.className = 'photo-name';
        name.textContent = photo.file.name;
        const place = document.createElement('button');
        place.type = 'button';
        place.className = 'photo-place';
        place.textContent = `선택 칸에 넣기`;
        place.setAttribute('aria-label', `${photo.file.name}을 선택된 칸에 배치`);
        place.addEventListener('click', () => {
            const frame = state.frames[state.selectedFrame];
            if (!frame) return;
            frame.photoId = photo.id;
            frame.zoom = 1;
            frame.panX = 0;
            frame.panY = 0;
            renderAll();
        });
        details.append(name, place);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'photo-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `${photo.file.name} 삭제`);
        remove.addEventListener('click', () => removePhoto(photo.id));
        item.append(thumbnail, details, remove);
        elements.photoList.appendChild(item);
    });
}

function removePhoto(photoId) {
    const photoIndex = state.photos.findIndex((photo) => photo.id === photoId);
    if (photoIndex < 0) return;
    const [photo] = state.photos.splice(photoIndex, 1);
    URL.revokeObjectURL(photo.objectUrl);
    state.frames.forEach((frame) => {
        if (frame.photoId === photoId) frame.photoId = null;
    });
    renderPhotoList();
    renderAll();
}

function roundRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
}

function getFrameRects(width, height, template) {
    const margin = state.margin;
    const gap = state.gap;
    const areaWidth = Math.max(1, width - margin * 2);
    const areaHeight = Math.max(1, height - margin * 2);
    return template.frames.map((frame) => {
        const left = margin + frame.x * areaWidth;
        const top = margin + frame.y * areaHeight;
        const right = margin + (frame.x + frame.w) * areaWidth;
        const bottom = margin + (frame.y + frame.h) * areaHeight;
        return {
            x: left + (frame.x > 0 ? gap / 2 : 0),
            y: top + (frame.y > 0 ? gap / 2 : 0),
            width: Math.max(1, right - left - (frame.x + frame.w < 1 ? gap / 2 : 0) - (frame.x > 0 ? gap / 2 : 0)),
            height: Math.max(1, bottom - top - (frame.y + frame.h < 1 ? gap / 2 : 0) - (frame.y > 0 ? gap / 2 : 0))
        };
    });
}

function calculateImageDraw(photo, frameState, rect) {
    const coverScale = Math.max(rect.width / photo.image.naturalWidth, rect.height / photo.image.naturalHeight) * frameState.zoom;
    const drawWidth = photo.image.naturalWidth * coverScale;
    const drawHeight = photo.image.naturalHeight * coverScale;
    const extraX = Math.max(0, (drawWidth - rect.width) / 2);
    const extraY = Math.max(0, (drawHeight - rect.height) / 2);
    frameState.panX = Math.max(-1, Math.min(1, frameState.panX));
    frameState.panY = Math.max(-1, Math.min(1, frameState.panY));
    const x = rect.x + (rect.width - drawWidth) / 2 + frameState.panX * extraX;
    const y = rect.y + (rect.height - drawHeight) / 2 + frameState.panY * extraY;
    return { x, y, width: drawWidth, height: drawHeight, extraX, extraY };
}

function drawComposition(ctx, width, height, options = {}) {
    const template = options.template || getTemplate();
    const frames = options.frames || state.frames;
    const photos = options.photos || state.photos;
    const photoMap = new Map(photos.map((photo) => [photo.id, photo]));
    const editing = options.editing !== false;
    const rects = getFrameRects(width, height, template);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = options.background || state.background;
    ctx.fillRect(0, 0, width, height);

    rects.forEach((rect, index) => {
        const cornerRadius = Math.min(state.radius, rect.width / 2, rect.height / 2);
        const frameState = frames[index] || { photoId: null, zoom: 1, panX: 0, panY: 0 };
        const photo = photoMap.get(frameState.photoId);

        roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, cornerRadius);
        ctx.save();
        ctx.clip();
        if (photo) {
            const draw = calculateImageDraw(photo, frameState, rect);
            ctx.drawImage(photo.image, draw.x, draw.y, draw.width, draw.height);
        } else {
            ctx.fillStyle = '#F2EFEB';
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
            if (editing) {
                ctx.fillStyle = '#77716C';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `${Math.max(12, Math.min(18, rect.width / 12))}px "Noto Sans KR", sans-serif`;
                ctx.fillText('사진을 추가해주세요.', rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(20, rect.width - 16));
            }
        }
        ctx.restore();

        if (editing && index === state.selectedFrame) {
            roundRectPath(ctx, rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, cornerRadius);
            ctx.strokeStyle = '#C55200';
            ctx.lineWidth = Math.max(2, width / 900);
            ctx.stroke();
        }
    });
    return rects;
}

function resizeAndRender() {
    const requestId = ++state.renderRequestId;
    state.renderError = false;
    const ratio = getRatio();
    const aspect = ratio.width / ratio.height;
    const availableWidth = Math.max(160, elements.previewStage.clientWidth - 36);
    const cssWidth = Math.min(availableWidth, 720 * aspect, 760);
    const cssHeight = cssWidth / aspect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    elements.canvas.style.width = `${cssWidth}px`;
    elements.canvas.style.height = `${cssHeight}px`;
    elements.canvas.width = Math.round(cssWidth * dpr);
    elements.canvas.height = Math.round(cssHeight * dpr);
    elements.previewStage.style.setProperty('--canvas-ratio', String(aspect));
    elements.emptyPreview.hidden = state.photos.length > 0;
    elements.previewDescription.textContent = state.photos.length
        ? `${getTemplate().count}장 템플릿 · ${ratio.id} 비율`
        : '사진을 업로드하면 콜라주를 미리볼 수 있습니다.';
    elements.canvas.setAttribute('aria-label', state.photos.length
        ? '콜라주 미리보기. 사진 칸을 선택하고 드래그하여 위치를 조정할 수 있습니다.'
        : '콜라주 미리보기. 사진을 업로드하면 콜라주를 미리볼 수 있습니다.');

    const scale = cssWidth / ratio.width;
    context.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    try {
        drawComposition(context, ratio.width, ratio.height);
        state.previewWidth = ratio.width;
        state.previewHeight = ratio.height;
    } catch (error) {
        if (requestId === state.renderRequestId) {
            state.renderError = true;
            setUploadError(error.message || '콜라주 미리보기를 표시하지 못했습니다.');
        }
    }
    updatePhotoControls();
    updateSaveButton();
}

function renderAll() {
    renderPhotoList();
    resizeAndRender();
}

function getPointerPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const ratio = getRatio();
    return {
        x: ((event.clientX - rect.left) / rect.width) * ratio.width,
        y: ((event.clientY - rect.top) / rect.height) * ratio.height
    };
}

function getFrameAt(point) {
    const rects = getFrameRects(getRatio().width, getRatio().height, getTemplate());
    for (let index = rects.length - 1; index >= 0; index -= 1) {
        const rect = rects[index];
        if (point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height) {
            return index;
        }
    }
    return -1;
}

function handlePointerDown(event) {
    const point = getPointerPoint(event);
    const frameIndex = getFrameAt(point);
    if (frameIndex < 0) return;
    state.selectedFrame = frameIndex;
    updatePhotoControls();
    resizeAndRender();
    const frameState = state.frames[frameIndex];
    state.pointerDrag = {
        pointerId: event.pointerId,
        frameIndex,
        startX: point.x,
        startY: point.y,
        startPanX: frameState.panX,
        startPanY: frameState.panY
    };
    elements.canvas.setPointerCapture(event.pointerId);
    elements.canvas.classList.add('is-dragging');
    event.preventDefault();
}

function handlePointerMove(event) {
    if (!state.pointerDrag || state.pointerDrag.pointerId !== event.pointerId) return;
    const drag = state.pointerDrag;
    const point = getPointerPoint(event);
    const rect = getFrameRects(getRatio().width, getRatio().height, getTemplate())[drag.frameIndex];
    const frameState = state.frames[drag.frameIndex];
    const photo = getPhoto(frameState.photoId);
    if (!photo) return;

    const draw = calculateImageDraw(photo, frameState, rect);
    frameState.panX = draw.extraX > 0
        ? Math.max(-1, Math.min(1, drag.startPanX + (point.x - drag.startX) / (draw.extraX * 2)))
        : 0;
    frameState.panY = draw.extraY > 0
        ? Math.max(-1, Math.min(1, drag.startPanY + (point.y - drag.startY) / (draw.extraY * 2)))
        : 0;
    resizeAndRender();
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

function readFileAsArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

function decodePhoto(file) {
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

function getPhotoKey(file) {
    return `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
}

function findNextEmptyFrame() {
    return state.frames.findIndex((frame) => !frame.photoId);
}

async function processFiles(fileList) {
    if (state.isProcessing || !fileList.length) return;
    state.isProcessing = true;
    elements.fileInput.disabled = true;
    elements.selectButton.disabled = true;
    elements.uploadBox.classList.add('is-processing');
    updateSaveButton();
    const errors = [];
    const addedPhotos = [];

    try {
        for (const file of fileList) {
            if (state.photos.length + addedPhotos.length >= MAX_PHOTOS) {
                errors.push('사진은 최대 6장까지 추가할 수 있습니다.');
                break;
            }
            if (state.photos.some((photo) => photo.key === getPhotoKey(file)) || addedPhotos.some((photo) => photo.key === getPhotoKey(file))) {
                errors.push(`${file.name}: 이미 추가된 사진입니다.`);
                continue;
            }
            if (file.size > MAX_FILE_SIZE) {
                errors.push(`${file.name}: 20MB 이하의 이미지를 선택해주세요.`);
                continue;
            }

            try {
                const buffer = await readFileAsArrayBuffer(file);
                if (!parseImageSignature(buffer)) {
                    throw new Error('지원하지 않는 이미지 형식입니다.');
                }
                const decoded = await decodePhoto(file);
                if (decoded.image.naturalWidth * decoded.image.naturalHeight > MAX_PIXEL_COUNT) {
                    URL.revokeObjectURL(decoded.objectUrl);
                    throw new Error('이미지 크기가 너무 큽니다. 더 작은 이미지를 사용해주세요.');
                }
                addedPhotos.push({
                    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    file,
                    key: getPhotoKey(file),
                    image: decoded.image,
                    objectUrl: decoded.objectUrl
                });
            } catch (error) {
                errors.push(`${file.name}: ${error.message || '이미지를 불러오지 못했습니다.'}`);
            }
        }

        state.photos.push(...addedPhotos);
        addedPhotos.forEach((photo) => {
            const emptyIndex = findNextEmptyFrame();
            if (emptyIndex >= 0) {
                state.frames[emptyIndex].photoId = photo.id;
                state.frames[emptyIndex].zoom = 1;
                state.frames[emptyIndex].panX = 0;
                state.frames[emptyIndex].panY = 0;
            }
        });
        setUploadError(errors.join('\n'));
        renderAll();
    } catch (error) {
        addedPhotos.forEach((photo) => {
            if (!state.photos.includes(photo)) URL.revokeObjectURL(photo.objectUrl);
        });
        setUploadError([errors.join('\n'), error.message || '사진을 처리하지 못했습니다.'].filter(Boolean).join('\n'));
    } finally {
        state.isProcessing = false;
        elements.fileInput.disabled = false;
        elements.selectButton.disabled = false;
        elements.uploadBox.classList.remove('is-processing');
        elements.fileInput.value = '';
        updateSaveButton();
    }
}

function canvasToBlob(canvas, format, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('콜라주 이미지를 생성하지 못했습니다.'));
        }, format, quality);
    });
}

function sanitizeBaseName(fileName) {
    return String(fileName || 'image')
        .replace(/\.[^/.]+$/, '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .trim() || 'image';
}

async function saveCollage() {
    if (elements.saveButton.disabled || state.isExporting || state.isProcessing) return;
    state.isExporting = true;
    updateSaveButton();
    const ratio = getRatio();
    const snapshot = {
        template: getTemplate(),
        frames: state.frames.map((frame) => ({ ...frame })),
        photos: state.photos.slice(),
        background: state.background,
        format: state.format,
        fileName: `${sanitizeBaseName(state.photos[0].file.name)}_콜라주.${state.format === 'image/jpeg' ? 'jpg' : 'png'}`
    };

    try {
        const canvas = document.createElement('canvas');
        canvas.width = ratio.width;
        canvas.height = ratio.height;
        const exportContext = canvas.getContext('2d');
        if (!exportContext) throw new Error('저장용 Canvas를 초기화할 수 없습니다.');
        drawComposition(exportContext, ratio.width, ratio.height, {
            template: snapshot.template,
            frames: snapshot.frames,
            photos: snapshot.photos,
            background: snapshot.background,
            editing: false
        });
        const blob = await canvasToBlob(canvas, snapshot.format, snapshot.format === 'image/jpeg' ? 0.95 : undefined);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = snapshot.fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setUploadError('');
    } catch (error) {
        state.renderError = true;
        setUploadError(error.message || '콜라주 저장에 실패했습니다.');
    } finally {
        state.isExporting = false;
        updateSaveButton();
    }
}

function bindControls() {
    elements.selectButton.addEventListener('click', () => {
        if (!state.isProcessing) elements.fileInput.click();
    });
    elements.fileInput.addEventListener('change', (event) => {
        processFiles(Array.from(event.target.files || []));
    });

    elements.uploadBox.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === elements.uploadBox) {
            event.preventDefault();
            elements.fileInput.click();
        }
    });
    elements.uploadBox.addEventListener('click', (event) => {
        if (event.target === elements.uploadBox && !state.isProcessing) {
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
        if (!state.isProcessing) processFiles(Array.from(event.dataTransfer.files || []));
    });

    elements.canvas.addEventListener('pointerdown', handlePointerDown);
    elements.canvas.addEventListener('pointermove', handlePointerMove);
    elements.canvas.addEventListener('pointerup', handlePointerUp);
    elements.canvas.addEventListener('pointercancel', handlePointerUp);
    elements.canvas.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    elements.canvas.addEventListener('drop', (event) => {
        event.preventDefault();
        const photoId = event.dataTransfer.getData('text/plain');
        const point = getPointerPoint(event);
        const frameIndex = getFrameAt(point);
        if (photoId && frameIndex >= 0 && getPhoto(photoId)) {
            state.selectedFrame = frameIndex;
            state.frames[frameIndex] = { photoId, zoom: 1, panX: 0, panY: 0 };
            renderAll();
        } else if (event.dataTransfer.files.length && !state.isProcessing) {
            processFiles(Array.from(event.dataTransfer.files));
        }
    });

    elements.zoomSlider.addEventListener('input', () => {
        const frame = state.frames[state.selectedFrame];
        if (!frame) return;
        frame.zoom = Number(elements.zoomSlider.value) / 100;
        elements.zoomValue.value = `${elements.zoomSlider.value}%`;
        resizeAndRender();
    });
    elements.resetPosition.addEventListener('click', () => {
        const frame = state.frames[state.selectedFrame];
        if (!frame) return;
        frame.zoom = 1;
        frame.panX = 0;
        frame.panY = 0;
        updatePhotoControls();
        resizeAndRender();
    });

    [[elements.marginSlider, 'margin'], [elements.gapSlider, 'gap'], [elements.radiusSlider, 'radius']].forEach(([slider, key]) => {
        slider.addEventListener('input', () => {
            state[key] = Number(slider.value);
            const output = document.getElementById(`${key}-value`);
            output.value = slider.value;
            resizeAndRender();
        });
    });

    document.querySelectorAll('.color-swatch').forEach((button) => {
        button.addEventListener('click', () => {
            state.background = button.dataset.color;
            document.querySelectorAll('.color-swatch').forEach((item) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            elements.backgroundColor.value = state.background;
            resizeAndRender();
        });
    });
    elements.backgroundColor.addEventListener('input', () => {
        state.background = elements.backgroundColor.value;
        document.querySelectorAll('.color-swatch').forEach((button) => {
            button.classList.remove('is-active');
            button.setAttribute('aria-pressed', 'false');
        });
        resizeAndRender();
    });

    document.querySelectorAll('.format-button').forEach((button) => {
        button.addEventListener('click', () => {
            if (state.format === button.dataset.format) return;
            state.format = button.dataset.format;
            document.querySelectorAll('.format-button').forEach((item) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            elements.jpegNotice.hidden = state.format !== 'image/jpeg';
            updateSaveButton();
        });
    });
    elements.saveButton.addEventListener('click', saveCollage);

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => resizeAndRender()).observe(elements.previewStage);
    } else {
        window.addEventListener('resize', resizeAndRender);
    }
}

validateTemplates();
state.frames = createFrameStates(getTemplate());
renderTemplateTabs();
renderTemplateGrid();
renderRatios();
bindControls();
resizeAndRender();
window.addEventListener('pagehide', () => {
    state.photos.forEach((photo) => URL.revokeObjectURL(photo.objectUrl));
});
