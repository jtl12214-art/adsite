const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;
const MAX_DIMENSION = 100_000;

const elements = {
    input: document.getElementById('image-input'),
    uploadBox: document.getElementById('upload-box'),
    fileName: document.getElementById('file-name'),
    uploadError: document.getElementById('upload-error'),
    sourceWidth: document.getElementById('source-width'),
    sourceHeight: document.getElementById('source-height'),
    sourceWidthError: document.getElementById('source-width-error'),
    sourceHeightError: document.getElementById('source-height-error'),
    targetWidth: document.getElementById('target-width'),
    targetHeight: document.getElementById('target-height'),
    targetWidthError: document.getElementById('target-width-error'),
    targetHeightError: document.getElementById('target-height-error'),
    maintainRatio: document.getElementById('maintain-ratio'),
    ratioHint: document.getElementById('ratio-hint'),
    originalContent: document.getElementById('original-content'),
    sourceSummary: document.getElementById('source-summary'),
    resultContent: document.getElementById('result-content'),
    toast: document.getElementById('toast'),
    canvas: document.getElementById('preview-canvas'),
    emptyPreview: document.getElementById('empty-preview'),
    previewStage: document.getElementById('preview-stage')
};

const previewContext = elements.canvas.getContext('2d');
if (!previewContext) {
    throw new Error('이미지 미리보기를 준비할 수 없습니다.');
}

const state = {
    image: null,
    objectUrl: '',
    file: null,
    uploadRequestId: 0,
    decodingUrls: new Set(),
    isUploading: false,
    sourceWidth: '',
    sourceHeight: '',
    targetWidth: '',
    targetHeight: '',
    maintainRatio: true,
    lastEditedTarget: 'width',
    targetsInitialized: false,
    toastTimer: 0,
    renderRequestId: 0
};

function showError(element, message) {
    element.textContent = message;
}

function parsePositiveInteger(value) {
    const text = String(value);
    if (!/^\d+$/.test(text)) return { valid: false, empty: text === '' };
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < 1) return { valid: false, empty: false };
    if (number > MAX_DIMENSION) return { valid: false, empty: false, tooLarge: true };
    return { valid: true, value: number, empty: false };
}

function getDimensionError(value) {
    const parsed = parsePositiveInteger(value);
    if (parsed.empty) return '';
    if (parsed.tooLarge) return '100,000px 이하의 값을 입력해주세요.';
    if (!parsed.valid) return '1 이상의 정수를 입력해주세요.';
    return '';
}

function greatestCommonDivisor(first, second) {
    let a = first;
    let b = second;
    while (b !== 0) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function getRatio(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
        return null;
    }
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function getDecimalRatio(width, height) {
    const ratio = width / height;
    if (!Number.isFinite(ratio)) return '';
    return ratio.toFixed(4).replace(/\.?0+$/, '');
}

function getOrientation(width, height) {
    if (width > height) return '가로형';
    if (width < height) return '세로형';
    return '정사각형';
}

function setInputValue(input, value) {
    const nextValue = value === '' ? '' : String(value);
    if (input.value !== nextValue) input.value = nextValue;
}

function roundDimension(value) {
    if (!Number.isFinite(value)) return '';
    return String(Math.max(1, Math.round(value)));
}

function updateTargetFromEditedField() {
    const sourceWidth = parsePositiveInteger(state.sourceWidth);
    const sourceHeight = parsePositiveInteger(state.sourceHeight);
    if (!sourceWidth.valid || !sourceHeight.valid) return;

    if (state.lastEditedTarget === 'width') {
        const targetWidth = parsePositiveInteger(state.targetWidth);
        if (targetWidth.valid) {
            state.targetHeight = roundDimension(
                targetWidth.value * sourceHeight.value / sourceWidth.value
            );
            setInputValue(elements.targetHeight, state.targetHeight);
        }
    } else {
        const targetHeight = parsePositiveInteger(state.targetHeight);
        if (targetHeight.valid) {
            state.targetWidth = roundDimension(
                targetHeight.value * sourceWidth.value / sourceHeight.value
            );
            setInputValue(elements.targetWidth, state.targetWidth);
        }
    }
}

function updateDimensionErrors() {
    showError(elements.sourceWidthError, getDimensionError(state.sourceWidth));
    showError(elements.sourceHeightError, getDimensionError(state.sourceHeight));
    showError(elements.targetWidthError, getDimensionError(state.targetWidth));
    showError(elements.targetHeightError, getDimensionError(state.targetHeight));
}

function getValidDimensions() {
    const sourceWidth = parsePositiveInteger(state.sourceWidth);
    const sourceHeight = parsePositiveInteger(state.sourceHeight);
    const targetWidth = parsePositiveInteger(state.targetWidth);
    const targetHeight = parsePositiveInteger(state.targetHeight);
    if (!sourceWidth.valid || !sourceHeight.valid || !targetWidth.valid || !targetHeight.valid) {
        return null;
    }
    return {
        sourceWidth: sourceWidth.value,
        sourceHeight: sourceHeight.value,
        targetWidth: targetWidth.value,
        targetHeight: targetHeight.value
    };
}

function makeInfoItem(label, value, subvalue = '') {
    const item = document.createElement('div');
    item.className = 'info-item';
    const title = document.createElement('p');
    title.className = 'info-label';
    title.textContent = label;
    const content = document.createElement('p');
    content.className = 'info-value';
    content.textContent = value;
    if (subvalue) {
        const extra = document.createElement('span');
        extra.className = 'info-subvalue';
        extra.textContent = subvalue;
        content.appendChild(extra);
    }
    item.append(title, content);
    return item;
}

function renderOriginalInfo() {
    if (!state.image || !state.file) {
        elements.originalContent.replaceChildren();
        elements.originalContent.insertAdjacentHTML(
            'beforeend',
            '<p class="empty-message">이미지를 불러오면 파일 정보를 확인할 수 있습니다.</p>'
        );
        return;
    }

    const width = state.image.naturalWidth;
    const height = state.image.naturalHeight;
    const megabytes = state.file.size / (1024 * 1024);
    const fileSize = megabytes >= 1
        ? `${megabytes.toFixed(2)} MB`
        : `${(state.file.size / 1024).toFixed(1)} KB`;
    const fileName = document.createElement('p');
    fileName.className = 'original-file-info';
    fileName.textContent = `${state.file.name} · ${width} × ${height} px`;
    const infoGrid = document.createElement('div');
    infoGrid.className = 'info-grid';
    infoGrid.append(
        makeInfoItem('이미지 비율', getRatio(width, height), getOrientation(width, height)),
        makeInfoItem('화소', `${((width * height) / 1_000_000).toFixed(2)} MP`),
        makeInfoItem('파일 크기', fileSize)
    );
    elements.originalContent.replaceChildren(fileName, infoGrid);
}

function renderSourceSummary(dimensions) {
    if (!dimensions) {
        const message = document.createElement('p');
        message.className = 'summary-empty';
        message.textContent = '기준 해상도를 입력하면 원본 정보를 확인할 수 있습니다.';
        elements.sourceSummary.replaceChildren(message);
        return;
    }

    const ratio = getRatio(dimensions.sourceWidth, dimensions.sourceHeight);
    const decimal = getDecimalRatio(dimensions.sourceWidth, dimensions.sourceHeight);
    const grid = document.createElement('div');
    grid.className = 'info-grid';
    grid.append(
        makeInfoItem(
            '기준 비율',
            ratio,
            decimal && decimal !== ratio ? decimal : ''
        ),
        makeInfoItem('방향', getOrientation(dimensions.sourceWidth, dimensions.sourceHeight)),
        makeInfoItem(
            '기준 화소',
            `${((dimensions.sourceWidth * dimensions.sourceHeight) / 1_000_000).toFixed(2)} MP`
        )
    );
    elements.sourceSummary.replaceChildren(grid);
}

function makeResultItem(label, value, subvalue = '') {
    const item = document.createElement('div');
    item.className = 'result-item';
    const title = document.createElement('p');
    title.className = 'result-label';
    title.textContent = label;
    const content = document.createElement('p');
    content.className = 'result-value';
    content.textContent = value;
    if (subvalue) {
        const extra = document.createElement('span');
        extra.className = 'info-subvalue';
        extra.textContent = subvalue;
        content.appendChild(extra);
    }
    item.append(title, content);
    return item;
}

function renderResults() {
    updateDimensionErrors();
    renderOriginalInfo();
    const sourceWidth = parsePositiveInteger(state.sourceWidth);
    const sourceHeight = parsePositiveInteger(state.sourceHeight);
    const sourceDimensions = sourceWidth.valid && sourceHeight.valid
        ? { sourceWidth: sourceWidth.value, sourceHeight: sourceHeight.value }
        : null;
    renderSourceSummary(sourceDimensions);

    const dimensions = getValidDimensions();
    if (!dimensions) {
        const message = document.createElement('p');
        message.className = 'empty-message';
        message.textContent = '기준 해상도를 입력하면 계산 결과를 확인할 수 있습니다.';
        elements.resultContent.replaceChildren(message);
        return;
    }

    const sourceRatio = getRatio(dimensions.sourceWidth, dimensions.sourceHeight);
    const targetRatio = getRatio(dimensions.targetWidth, dimensions.targetHeight);
    const widthScale = dimensions.targetWidth / dimensions.sourceWidth * 100;
    const heightScale = dimensions.targetHeight / dimensions.sourceHeight * 100;
    const ratioScale = `${widthScale.toFixed(1)}%`;
    const scaleText = state.maintainRatio || Math.abs(widthScale - heightScale) < 0.05
        ? ratioScale
        : `가로 ${widthScale.toFixed(1)}% · 세로 ${heightScale.toFixed(1)}%`;

    const main = document.createElement('div');
    main.className = 'result-main';
    const mainLabel = document.createElement('p');
    mainLabel.className = 'result-label';
    mainLabel.textContent = '목표 해상도';
    const resolution = document.createElement('p');
    resolution.className = 'result-resolution';
    resolution.textContent = `${dimensions.targetWidth} × ${dimensions.targetHeight} px`;
    main.append(mainLabel, resolution);

    const grid = document.createElement('div');
    grid.className = 'result-grid';
    grid.append(
        makeResultItem('목표 비율', targetRatio, `소수 비율 ${getDecimalRatio(dimensions.targetWidth, dimensions.targetHeight)}`),
        makeResultItem('원본 기준 비율', sourceRatio),
        makeResultItem('기준 대비 크기', scaleText),
        makeResultItem('목표 화소', `${((dimensions.targetWidth * dimensions.targetHeight) / 1_000_000).toFixed(2)} MP`)
    );

    const note = document.createElement('p');
    note.className = 'result-note';
    note.hidden = state.maintainRatio;
    note.textContent = '원본과 다른 비율이 될 수 있습니다.';

    const actions = document.createElement('div');
    actions.className = 'copy-actions';
    const copyResultButton = document.createElement('button');
    copyResultButton.className = 'copy-button';
    copyResultButton.type = 'button';
    copyResultButton.textContent = '결과 복사';
    copyResultButton.addEventListener('click', () => {
        copyText(`${dimensions.targetWidth} × ${dimensions.targetHeight} px · ${targetRatio}`, '계산 결과가 복사되었습니다.');
    });
    const copyRatioButton = document.createElement('button');
    copyRatioButton.className = 'copy-button';
    copyRatioButton.type = 'button';
    copyRatioButton.textContent = '비율 복사';
    copyRatioButton.addEventListener('click', () => copyText(targetRatio, '비율이 복사되었습니다.'));
    actions.append(copyResultButton, copyRatioButton);
    elements.resultContent.replaceChildren(main, grid, note, actions);
}

function handleSourceDimensionInput(side) {
    const isWidth = side === 'width';
    state[isWidth ? 'sourceWidth' : 'sourceHeight'] = elements[isWidth ? 'sourceWidth' : 'sourceHeight'].value;
    const widthValid = parsePositiveInteger(state.sourceWidth).valid;
    const heightValid = parsePositiveInteger(state.sourceHeight).valid;

    if (widthValid && heightValid) {
        if (!state.targetsInitialized) {
            state.targetWidth = state.sourceWidth;
            state.targetHeight = state.sourceHeight;
            state.targetsInitialized = true;
            setInputValue(elements.targetWidth, state.targetWidth);
            setInputValue(elements.targetHeight, state.targetHeight);
        } else if (state.maintainRatio) {
            updateTargetFromEditedField();
        }
    }
    renderResults();
}

function handleTargetDimensionInput(side) {
    const isWidth = side === 'width';
    state.lastEditedTarget = side;
    state[isWidth ? 'targetWidth' : 'targetHeight'] = elements[isWidth ? 'targetWidth' : 'targetHeight'].value;
    if (state.maintainRatio) updateTargetFromEditedField();
    renderResults();
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
        state.decodingUrls.add(objectUrl);
        const image = new Image();
        image.onload = () => {
            state.decodingUrls.delete(objectUrl);
            resolve({ image, objectUrl });
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            state.decodingUrls.delete(objectUrl);
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

function formatFileSize(size) {
    const megabytes = size / (1024 * 1024);
    return megabytes >= 1
        ? `${megabytes.toFixed(2)} MB`
        : `${(size / 1024).toFixed(1)} KB`;
}

async function processFile(file) {
    if (!file) return;
    const requestId = ++state.uploadRequestId;
    state.isUploading = true;
    elements.fileName.textContent = '이미지 확인 중...';
    elements.uploadBox.classList.add('is-processing');
    elements.uploadBox.setAttribute('aria-busy', 'true');
    showError(elements.uploadError, '');

    try {
        const decoded = await validateAndDecode(file);
        if (requestId !== state.uploadRequestId) {
            URL.revokeObjectURL(decoded.objectUrl);
            return;
        }

        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        state.image = decoded.image;
        state.objectUrl = decoded.objectUrl;
        state.file = file;
        state.sourceWidth = String(decoded.image.naturalWidth);
        state.sourceHeight = String(decoded.image.naturalHeight);
        state.targetWidth = state.sourceWidth;
        state.targetHeight = state.sourceHeight;
        state.maintainRatio = true;
        state.lastEditedTarget = 'width';
        state.targetsInitialized = true;
        elements.sourceWidth.value = state.sourceWidth;
        elements.sourceHeight.value = state.sourceHeight;
        elements.targetWidth.value = state.targetWidth;
        elements.targetHeight.value = state.targetHeight;
        elements.maintainRatio.checked = true;
        elements.ratioHint.hidden = true;
        elements.fileName.textContent = file.name;
        renderPreview();
        renderResults();
    } catch (error) {
        if (requestId === state.uploadRequestId) {
            elements.fileName.textContent = state.file ? state.file.name : '선택된 파일 없음';
            showError(elements.uploadError, error.message || '이미지를 불러오지 못했습니다.');
        }
    } finally {
        if (requestId === state.uploadRequestId) {
            state.isUploading = false;
            elements.input.value = '';
            elements.uploadBox.classList.remove('is-processing');
            elements.uploadBox.setAttribute('aria-busy', 'false');
        }
    }
}

function renderPreview() {
    const requestId = ++state.renderRequestId;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const style = getComputedStyle(elements.previewStage);
    const width = Math.max(1, elements.previewStage.clientWidth
        - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const height = Math.max(1, elements.previewStage.clientHeight
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    elements.canvas.style.width = `${width}px`;
    elements.canvas.style.height = `${height}px`;
    elements.canvas.width = Math.max(1, Math.round(width * dpr));
    elements.canvas.height = Math.max(1, Math.round(height * dpr));
    previewContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    previewContext.clearRect(0, 0, width, height);
    elements.emptyPreview.hidden = Boolean(state.image);
    if (!state.image) return;

    const imageWidth = state.image.naturalWidth;
    const imageHeight = state.image.naturalHeight;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    previewContext.drawImage(state.image, x, y, drawWidth, drawHeight);
    elements.canvas.setAttribute('aria-label', `이미지 미리보기 ${imageWidth} × ${imageHeight} 픽셀`);
    if (requestId !== state.renderRequestId) return;
}

async function copyText(text, successMessage) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const temporaryInput = document.createElement('textarea');
            temporaryInput.value = text;
            temporaryInput.setAttribute('readonly', '');
            temporaryInput.style.position = 'fixed';
            temporaryInput.style.opacity = '0';
            document.body.appendChild(temporaryInput);
            temporaryInput.select();
            const copied = document.execCommand('copy');
            temporaryInput.remove();
            if (!copied) throw new Error('복사할 수 없습니다.');
        }
        showToast(successMessage);
    } catch {
        showToast('복사하지 못했습니다. 브라우저 권한을 확인해주세요.');
    }
}

function showToast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => {
        elements.toast.classList.remove('is-visible');
        elements.toast.textContent = '';
    }, 1800);
}

function resetCalculator() {
    if (state.image) {
        state.sourceWidth = String(state.image.naturalWidth);
        state.sourceHeight = String(state.image.naturalHeight);
        state.targetWidth = state.sourceWidth;
        state.targetHeight = state.sourceHeight;
        state.targetsInitialized = true;
        elements.sourceWidth.value = state.sourceWidth;
        elements.sourceHeight.value = state.sourceHeight;
        elements.targetWidth.value = state.targetWidth;
        elements.targetHeight.value = state.targetHeight;
    } else {
        state.sourceWidth = '';
        state.sourceHeight = '';
        state.targetWidth = '';
        state.targetHeight = '';
        state.targetsInitialized = false;
        elements.sourceWidth.value = '';
        elements.sourceHeight.value = '';
        elements.targetWidth.value = '';
        elements.targetHeight.value = '';
    }
    state.maintainRatio = true;
    state.lastEditedTarget = 'width';
    elements.maintainRatio.checked = true;
    elements.ratioHint.hidden = true;
    showError(elements.uploadError, '');
    renderResults();
}

function bindEvents() {
    elements.input.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        processFile(file);
    });
    elements.uploadBox.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!state.isUploading) elements.uploadBox.classList.add('is-dragover');
    });
    elements.uploadBox.addEventListener('dragleave', (event) => {
        if (!elements.uploadBox.contains(event.relatedTarget)) {
            elements.uploadBox.classList.remove('is-dragover');
        }
    });
    elements.uploadBox.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.uploadBox.classList.remove('is-dragover');
        if (!state.isUploading) processFile(event.dataTransfer.files[0]);
    });

    elements.sourceWidth.addEventListener('input', () => handleSourceDimensionInput('width'));
    elements.sourceHeight.addEventListener('input', () => handleSourceDimensionInput('height'));
    elements.targetWidth.addEventListener('input', () => handleTargetDimensionInput('width'));
    elements.targetHeight.addEventListener('input', () => handleTargetDimensionInput('height'));
    [elements.sourceWidth, elements.sourceHeight, elements.targetWidth, elements.targetHeight].forEach((input) => {
        input.addEventListener('blur', updateDimensionErrors);
    });
    elements.maintainRatio.addEventListener('change', () => {
        state.maintainRatio = elements.maintainRatio.checked;
        elements.ratioHint.hidden = state.maintainRatio;
        if (state.maintainRatio) updateTargetFromEditedField();
        renderResults();
    });
    document.getElementById('reset-button').addEventListener('click', resetCalculator);

    if ('ResizeObserver' in window) {
        new ResizeObserver(renderPreview).observe(elements.previewStage);
    } else {
        window.addEventListener('resize', renderPreview);
    }
    window.addEventListener('pagehide', () => {
        state.uploadRequestId += 1;
        state.decodingUrls.forEach((url) => URL.revokeObjectURL(url));
        state.decodingUrls.clear();
        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        window.clearTimeout(state.toastTimer);
    });
}

bindEvents();
renderResults();
renderPreview();
