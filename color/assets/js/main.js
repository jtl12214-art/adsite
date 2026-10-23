const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXEL_COUNT = 20_000_000;
const ANALYSIS_LONG_EDGE = 300;
const COLOR_DISTANCE_THRESHOLD = 46;
const MIN_CANDIDATE_SHARE = 0.0001;
const MIN_RESULT_SHARE = 0.01;

const elements = {
    input: document.getElementById('image-input'),
    uploadBox: document.getElementById('upload-box'),
    fileName: document.getElementById('file-name'),
    uploadError: document.getElementById('upload-error'),
    previewStage: document.getElementById('preview-stage'),
    canvas: document.getElementById('preview-canvas'),
    emptyPreview: document.getElementById('empty-preview'),
    imageInfo: document.getElementById('image-info'),
    analysisStatus: document.getElementById('analysis-status'),
    resultCount: document.getElementById('result-count'),
    colorList: document.getElementById('color-list'),
    toast: document.getElementById('toast')
};

const previewContext = elements.canvas.getContext('2d');
if (!previewContext) {
    throw new Error('미리보기 Canvas를 초기화할 수 없습니다.');
}

const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
if (!analysisContext) {
    throw new Error('색상 분석 Canvas를 초기화할 수 없습니다.');
}

const state = {
    image: null,
    objectUrl: '',
    fileName: '',
    isProcessing: false,
    uploadRequestId: 0,
    analysisRequestId: 0,
    renderRequestId: 0,
    colors: [],
    imageRect: null,
    toastTimer: 0,
    pendingObjectUrl: '',
    decodingUrls: new Set()
};

function showError(message) {
    elements.uploadError.textContent = message;
}

function updateUploadState() {
    elements.input.disabled = state.isProcessing;
    elements.uploadBox.classList.toggle('is-processing', state.isProcessing);
    elements.uploadBox.setAttribute('aria-busy', String(state.isProcessing));
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

function clearResults() {
    state.colors = [];
    elements.colorList.replaceChildren();
    elements.resultCount.hidden = true;
    elements.resultCount.textContent = '';
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

function renderPreview() {
    const requestId = ++state.renderRequestId;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const available = getPreviewDimensions();
    elements.canvas.style.width = `${available.width}px`;
    elements.canvas.style.height = `${available.height}px`;
    elements.canvas.width = Math.max(1, Math.round(available.width * dpr));
    elements.canvas.height = Math.max(1, Math.round(available.height * dpr));
    previewContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    previewContext.clearRect(0, 0, available.width, available.height);
    elements.emptyPreview.hidden = Boolean(state.image);

    if (!state.image) {
        state.imageRect = null;
        elements.imageInfo.textContent = '';
        elements.canvas.setAttribute('aria-label', '업로드 이미지 미리보기');
        return;
    }

    const width = state.image.naturalWidth;
    const height = state.image.naturalHeight;
    const scale = Math.min(available.width / width, available.height / height);
    const displayWidth = width * scale;
    const displayHeight = height * scale;
    const x = (available.width - displayWidth) / 2;
    const y = (available.height - displayHeight) / 2;

    state.imageRect = { x, y, width: displayWidth, height: displayHeight, scale };
    previewContext.drawImage(state.image, x, y, displayWidth, displayHeight);
    elements.imageInfo.textContent = `${state.fileName} · ${width} × ${height} px`;
    elements.canvas.setAttribute('aria-label', `이미지 미리보기 ${width} × ${height} 픽셀`);
    if (requestId !== state.renderRequestId) return;
}

function colorDistance(first, second) {
    return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

function collectHistogram(imageData) {
    const histogram = new Map();
    const data = imageData.data;
    let validPixelCount = 0;

    for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha < 128) continue;

        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
        let bucket = histogram.get(key);
        if (!bucket) {
            bucket = { count: 0, red: 0, green: 0, blue: 0 };
            histogram.set(key, bucket);
        }
        bucket.count += 1;
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        validPixelCount += 1;
    }

    return { histogram, validPixelCount };
}

function bucketColor(bucket) {
    return {
        r: bucket.red / bucket.count,
        g: bucket.green / bucket.count,
        b: bucket.blue / bucket.count,
        count: bucket.count
    };
}

function getRepresentativeColors(imageData) {
    const { histogram, validPixelCount } = collectHistogram(imageData);
    if (!validPixelCount) return [];

    const buckets = [...histogram.entries()]
        .map(([key, bucket]) => ({ key, ...bucket, color: bucketColor(bucket) }))
        .sort((first, second) => second.count - first.count || first.key - second.key);
    const candidates = [];
    const minimumCandidateCount = Math.max(2, Math.ceil(validPixelCount * MIN_CANDIDATE_SHARE));

    for (const candidate of buckets) {
        if (candidate.count < minimumCandidateCount) break;
        if (candidates.every((selected) => colorDistance(candidate.color, selected.color) >= COLOR_DISTANCE_THRESHOLD)) {
            candidates.push(candidate);
            if (candidates.length === 5) break;
        }
    }
    if (!candidates.length) candidates.push(buckets[0]);

    let clusters = candidates.map((candidate) => ({ ...candidate.color, count: 0, red: 0, green: 0, blue: 0 }));
    for (let iteration = 0; iteration < 5; iteration += 1) {
        const centers = clusters;
        const nextClusters = centers.map(() => ({ count: 0, red: 0, green: 0, blue: 0 }));
        buckets.forEach((bucket) => {
            let nearestIndex = 0;
            let nearestDistance = Infinity;
            centers.forEach((cluster, index) => {
                const distance = colorDistance(bucket.color, cluster);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = index;
                }
            });
            const cluster = nextClusters[nearestIndex];
            cluster.count += bucket.count;
            cluster.red += bucket.red;
            cluster.green += bucket.green;
            cluster.blue += bucket.blue;
        });
        clusters = nextClusters
            .filter((cluster) => cluster.count > 0)
            .map((cluster) => ({
                r: cluster.red / cluster.count,
                g: cluster.green / cluster.count,
                b: cluster.blue / cluster.count,
                count: cluster.count,
                red: cluster.red,
                green: cluster.green,
                blue: cluster.blue
            }));
    }

    clusters.sort((first, second) => second.count - first.count);
    const merged = [];
    clusters.forEach((cluster) => {
        const similar = merged.find((existing) => colorDistance(cluster, existing) < COLOR_DISTANCE_THRESHOLD);
        if (similar) {
            similar.count += cluster.count;
            similar.red += cluster.red;
            similar.green += cluster.green;
            similar.blue += cluster.blue;
            similar.r = similar.red / similar.count;
            similar.g = similar.green / similar.count;
            similar.b = similar.blue / similar.count;
        } else {
            merged.push({ ...cluster });
        }
    });
    const minimumResultCount = Math.max(1, Math.ceil(validPixelCount * MIN_RESULT_SHARE));
    for (let index = merged.length - 1; index > 0; index -= 1) {
        const cluster = merged[index];
        if (cluster.count >= minimumResultCount) continue;
        const nearest = merged
            .slice(0, index)
            .reduce((best, candidate) => colorDistance(cluster, candidate) < colorDistance(cluster, best) ? candidate : best);
        nearest.count += cluster.count;
        nearest.red += cluster.red;
        nearest.green += cluster.green;
        nearest.blue += cluster.blue;
        nearest.r = nearest.red / nearest.count;
        nearest.g = nearest.green / nearest.count;
        nearest.b = nearest.blue / nearest.count;
        merged.splice(index, 1);
    }
    merged.sort((first, second) => second.count - first.count);

    const clusterPixelCount = merged.reduce((total, cluster) => total + cluster.count, 0);
    return merged.map((cluster) => {
        const red = Math.max(0, Math.min(255, Math.round(cluster.r)));
        const green = Math.max(0, Math.min(255, Math.round(cluster.g)));
        const blue = Math.max(0, Math.min(255, Math.round(cluster.b)));
        return {
            red,
            green,
            blue,
            hex: `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
            percent: (cluster.count / clusterPixelCount) * 100,
            count: cluster.count
        };
    });
}

function makeColorCard(color, index) {
    const card = document.createElement('article');
    card.className = 'color-card';
    card.setAttribute('aria-label', `대표 색상 ${index + 1} ${color.hex}`);

    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color.hex;
    swatch.textContent = color.hex;
    swatch.setAttribute('aria-label', `색상 견본 ${color.hex}`);

    const details = document.createElement('div');
    details.className = 'color-details';

    const values = document.createElement('div');
    values.className = 'color-values';
    const hex = document.createElement('span');
    hex.className = 'color-hex';
    hex.textContent = color.hex;
    const share = document.createElement('span');
    share.className = 'color-share';
    share.textContent = `${color.percent.toFixed(1)}%`;
    values.append(hex, share);

    const rgb = document.createElement('p');
    rgb.className = 'color-rgb';
    rgb.textContent = `RGB ${color.red}, ${color.green}, ${color.blue}`;

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.type = 'button';
    copyButton.textContent = 'HEX 복사';
    copyButton.setAttribute('aria-label', `${color.hex} HEX 값 복사`);
    copyButton.addEventListener('click', () => copyHex(color.hex));

    details.append(values, rgb, copyButton);
    card.append(swatch, details);
    return card;
}

function renderColors(colors) {
    const fragment = document.createDocumentFragment();
    colors.forEach((color, index) => fragment.appendChild(makeColorCard(color, index)));
    elements.colorList.replaceChildren(fragment);
    elements.resultCount.hidden = colors.length === 0;
    elements.resultCount.textContent = `${colors.length}개`;
}

async function analyzeImage(image, requestId) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (requestId !== state.analysisRequestId) return;

    const scale = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    analysisCanvas.width = width;
    analysisCanvas.height = height;
    analysisContext.clearRect(0, 0, width, height);
    analysisContext.drawImage(image, 0, 0, width, height);

    const imageData = analysisContext.getImageData(0, 0, width, height);
    const colors = getRepresentativeColors(imageData);
    if (requestId !== state.analysisRequestId) return;

    state.colors = colors;
    renderColors(colors);
    elements.analysisStatus.textContent = colors.length
        ? ''
        : '분석할 수 있는 색상이 없습니다.';
}

async function processFile(file) {
    if (!file || state.isProcessing) return;
    const requestId = ++state.uploadRequestId;
    const analysisRequestId = ++state.analysisRequestId;
    const previousObjectUrl = state.objectUrl || state.pendingObjectUrl;
    state.pendingObjectUrl = previousObjectUrl;
    state.objectUrl = '';
    state.image = null;
    state.fileName = '';
    state.isProcessing = true;
    elements.fileName.textContent = '이미지 확인 중...';
    elements.imageInfo.textContent = '';
    elements.analysisStatus.textContent = '이미지를 확인하고 있습니다.';
    showError('');
    clearResults();
    renderPreview();
    updateUploadState();

    try {
        const decoded = await validateAndDecode(file);
        if (requestId !== state.uploadRequestId) {
            URL.revokeObjectURL(decoded.objectUrl);
            return;
        }

        if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
        state.pendingObjectUrl = '';
        state.objectUrl = decoded.objectUrl;
        state.image = decoded.image;
        state.fileName = file.name;
        elements.fileName.textContent = file.name;
        elements.analysisStatus.textContent = '색상을 분석하고 있습니다.';
        renderPreview();
        state.isProcessing = false;
        elements.input.value = '';
        updateUploadState();
        await analyzeImage(decoded.image, analysisRequestId);
    } catch (error) {
        if (requestId === state.uploadRequestId) {
            state.image = null;
            state.fileName = '';
            elements.fileName.textContent = '선택된 파일 없음';
            elements.analysisStatus.textContent = '';
            if (state.objectUrl) {
                URL.revokeObjectURL(state.objectUrl);
                state.objectUrl = '';
            }
            if (state.pendingObjectUrl) {
                URL.revokeObjectURL(state.pendingObjectUrl);
                state.pendingObjectUrl = '';
            }
            showError(error.message || '이미지를 불러오지 못했습니다.');
            renderPreview();
        }
    } finally {
        if (requestId === state.uploadRequestId) {
            state.isProcessing = false;
            elements.input.value = '';
            updateUploadState();
        }
    }
}

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

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

async function copyHex(hex) {
    try {
        await copyText(hex);
        showToast('HEX 값이 복사되었습니다.');
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

function bindEvents() {
    elements.input.addEventListener('change', (event) => {
        const [file] = event.target.files || [];
        processFile(file);
    });
    elements.uploadBox.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (!state.isProcessing) elements.uploadBox.classList.add('is-dragover');
    });
    elements.uploadBox.addEventListener('dragleave', (event) => {
        if (!elements.uploadBox.contains(event.relatedTarget)) {
            elements.uploadBox.classList.remove('is-dragover');
        }
    });
    elements.uploadBox.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.uploadBox.classList.remove('is-dragover');
        if (!state.isProcessing) processFile(event.dataTransfer.files[0]);
    });

    if ('ResizeObserver' in window) {
        new ResizeObserver(renderPreview).observe(elements.previewStage);
    } else {
        window.addEventListener('resize', renderPreview);
    }

    window.addEventListener('pagehide', () => {
        state.uploadRequestId += 1;
        state.analysisRequestId += 1;
        if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
        if (state.pendingObjectUrl) URL.revokeObjectURL(state.pendingObjectUrl);
        state.decodingUrls.forEach((url) => URL.revokeObjectURL(url));
        state.decodingUrls.clear();
        window.clearTimeout(state.toastTimer);
    });
}

bindEvents();
renderPreview();
