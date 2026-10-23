/*
 * PixCompress v1
 * - 이미지 파일은 외부 서버에 업로드하지 않습니다.
 * - 원본 비율 유지 / 실제 Blob 크기와 MIME 형식 확인
 * - 품질 탐색(JPEG/WEBP), 해상도 축소(PNG 및 보조 수단)
 */
(function ($) {
  'use strict';

  const KB = 1024;
  const MAX_FILE_BYTES = 25 * 1024 * KB;        // 25MB
  const MAX_IMAGE_PIXELS = 24_000_000;          // 2,400만 화소
  const MAX_IMAGE_EDGE = 10_000;
  const MIN_CUSTOM_KB = 10;
  const MAX_CUSTOM_KB = 25_600;
  const QUALITY_LOW = 0.56;                     // 화질을 지나치게 낮추지 않습니다.
  const QUALITY_HIGH = 0.92;
  const MAX_BINARY_STEPS = 5;
  const MAX_RESIZE_STEPS = 10;
  const RESIZE_FACTOR = 0.8;
  const MIN_LONG_EDGE = 720;
  const MAX_ENCODE_ATTEMPTS = 70;

  const MIME_OPTIONS = {
    'image/jpeg': { label: 'JPEG', ext: 'jpg' },
    'image/webp': { label: 'WEBP', ext: 'webp' },
    'image/png': { label: 'PNG', ext: 'png' }
  };

  const state = {
    file: null,
    sourceMime: null,
    image: null,
    originalUrl: null,
    resultUrl: null,
    resultBlob: null,
    resultMime: null,
    selectedMime: 'image/jpeg',
    selectedTarget: '500',
    lastValidTargetKB: 500,
    customTargetInvalid: false,
    isProcessing: false,
    selectionVersion: 0
  };

  const $imageInput = $('#imageInput');
  const $uploadArea = $('#uploadArea');
  const $compressButton = $('#compressButton');
  const $downloadButton = $('#downloadButton');
  const $targetButtons = $('.target-button');
  const $formatButtons = $('.format-button');
  const $customWrap = $('#customTargetWrap');
  const $customInput = $('#customTargetInput');

  function setStatus(message, type = '') {
    $('#statusMessage').text(message).removeClass('is-error is-success')
      .toggleClass('is-error', type === 'error')
      .toggleClass('is-success', type === 'success');
  }

  function formatBytes(bytes) {
    if (bytes >= KB * KB) return trimTrailingZeros(bytes / (KB * KB), 2) + 'MB';
    if (bytes >= KB) return trimTrailingZeros(bytes / KB, 2) + 'KB';
    return bytes + 'B';
  }

  function trimTrailingZeros(value, digits) {
    return value.toFixed(digits).replace(/\.?0+$/, '');
  }

  function formatResolution(width, height) {
    return width.toLocaleString('ko-KR') + ' × ' + height.toLocaleString('ko-KR') + 'px';
  }

  function getTargetKB() {
    if (state.selectedTarget !== 'custom') return Number(state.selectedTarget);
    return getCustomTargetKB();
  }

  function getCustomTargetKB() {
    const raw = $customInput.val().toString().trim();
    const value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value < MIN_CUSTOM_KB || value > MAX_CUSTOM_KB) return null;
    return value;
  }

  function formatTarget(kb) {
    return kb === 1024 ? '1MB 이하' : kb.toLocaleString('ko-KR') + 'KB 이하';
  }

  function updateTargetSummary() {
    const kb = getTargetKB();
    $('#targetSummary strong').text(kb === null ? '올바른 용량을 입력해주세요' : formatTarget(kb));
    updateCompressButton();
  }

  function updateCompressButton() {
    $compressButton.prop('disabled', state.isProcessing || !state.file || getTargetKB() === null);
  }

  function setControlsDisabled(disabled) {
    $imageInput.prop('disabled', disabled);
    $targetButtons.prop('disabled', disabled);
    $formatButtons.prop('disabled', disabled);
    $customInput.prop('disabled', disabled);
    $uploadArea.toggleClass('is-disabled', disabled);
    updateCompressButton();
  }

  function releaseUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function clearResult() {
    releaseUrl(state.resultUrl);
    state.resultUrl = null;
    state.resultBlob = null;
    state.resultMime = null;
    $('#resultPreview').removeAttr('src').prop('hidden', true);
    $('#resultPlaceholder').prop('hidden', false);
    $('#resultPreviewSize').text('압축 결과 없음');
    $('#resultPanel').prop('hidden', true);
    $downloadButton.prop('disabled', true);
  }

  function clearFile() {
    clearResult();
    releaseUrl(state.originalUrl);
    state.file = null;
    state.sourceMime = null;
    state.image = null;
    state.originalUrl = null;
    $('#originalPreview').removeAttr('src').prop('hidden', true);
    $('#originalPlaceholder').prop('hidden', false);
    $('#originalPreviewSize').text('원본 파일 없음');
    $('#fileInfo').prop('hidden', true);
    updateCompressButton();
    updateFormatNotice();
  }

  function invalidateResult(message, type = '') {
    clearResult();
    setStatus(message || (state.file ? '설정이 변경되었습니다. 다시 압축해주세요.' : '이미지를 업로드하면 압축할 수 있습니다.'), type);
    updateCompressButton();
  }

  function selectTarget(value, shouldFocus) {
    if (state.isProcessing) return;
    const nextTargetKB = value === 'custom' ? getCustomTargetKB() : Number(value);
    const targetChanged = nextTargetKB !== null && nextTargetKB !== state.lastValidTargetKB;
    if (value === state.selectedTarget && !targetChanged && nextTargetKB !== null) {
      if (value === 'custom' && shouldFocus) $customInput.trigger('focus');
      return;
    }
    if (nextTargetKB !== null) state.lastValidTargetKB = nextTargetKB;
    const hadInvalidCustomTarget = state.customTargetInvalid;
    const recoveringFromInvalidCustom = state.selectedTarget === 'custom' && hadInvalidCustomTarget && value !== 'custom';
    state.customTargetInvalid = value === 'custom' && nextTargetKB === null;
    state.selectedTarget = value;
    $targetButtons.each(function () {
      const selected = $(this).data('kb').toString() === value;
      $(this).toggleClass('is-active', selected).attr('aria-pressed', selected ? 'true' : 'false');
    });
    $customWrap.prop('hidden', value !== 'custom');
    if (value === 'custom' && shouldFocus) $customInput.trigger('focus');
    updateTargetSummary();
    if (nextTargetKB === null) {
      invalidateResult('10~25,600KB 사이의 정수를 입력해주세요.', 'error');
    } else if (targetChanged) {
      invalidateResult(value === 'custom' && hadInvalidCustomTarget
        ? '목표 용량이 설정되었습니다. 이미지를 다시 압축해주세요.'
        : undefined);
    } else if ((value === 'custom' && hadInvalidCustomTarget) || recoveringFromInvalidCustom) {
      setStatus('목표 용량이 설정되었습니다. 이미지를 다시 압축해주세요.');
    }
  }

  function selectFormat(mime, shouldInvalidate) {
    if (state.isProcessing || !MIME_OPTIONS[mime]) return;
    if (mime === state.selectedMime) return;
    state.selectedMime = mime;
    $formatButtons.each(function () {
      const selected = $(this).data('format') === mime;
      $(this).toggleClass('is-active', selected).attr('aria-pressed', selected ? 'true' : 'false');
    });
    updateFormatNotice();
    if (shouldInvalidate) invalidateResult();
  }

  function updateFormatNotice() {
    let message;
    if (state.selectedMime === 'image/jpeg') {
      message = 'JPEG는 사진 압축에 적합합니다. 투명 영역은 흰색으로 저장됩니다.';
    } else if (state.selectedMime === 'image/webp') {
      message = 'WEBP는 사진 압축 및 투명도 보존에 적합합니다. 브라우저 지원 여부를 확인합니다.';
    } else {
      message = 'PNG는 투명도를 보존합니다. 품질값으로 용량을 줄일 수 없어 해상도가 축소될 수 있습니다.';
    }
    $('#formatNotice').text(message);
    if (state.sourceMime && state.sourceMime !== state.selectedMime) {
      $('#conversionNotice').text(
        MIME_OPTIONS[state.sourceMime].label + ' → ' + MIME_OPTIONS[state.selectedMime].label + ' 형식으로 변환됩니다.'
      ).prop('hidden', false);
    } else {
      $('#conversionNotice').prop('hidden', true);
    }
  }

  function inferImageMime(file) {
    const declaredType = (file.type || '').toLowerCase();
    if (declaredType) return MIME_OPTIONS[declaredType] ? declaredType : null;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return null;
  }

  // 파일의 표면 MIME 표시만 믿지 않고 실제 헤더를 확인합니다.
  async function hasCorrectSignature(blob, mime) {
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (mime === 'image/jpeg') {
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (mime === 'image/png') {
      const header = [137, 80, 78, 71, 13, 10, 26, 10];
      return bytes.length >= 8 && header.every((value, index) => bytes[index] === value);
    }
    if (mime === 'image/webp') {
      return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    }
    return false;
  }

  function loadImageFromUrl(url) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지를 열 수 없습니다. 손상되었거나 지원하지 않는 파일입니다.'));
      image.src = url;
    });
  }

  async function handleFileSelection(files) {
    if (state.isProcessing) return;
    const fileArray = Array.from(files || []);
    if (!fileArray.length) return;
    ++state.selectionVersion;
    const selectionId = state.selectionVersion;
    clearFile();
    const file = fileArray[0];
    const mime = inferImageMime(file);

    if (fileArray.length > 1) {
      setStatus('한 번에 이미지 1장만 선택할 수 있습니다.', 'error');
      return;
    }
    if (!mime) {
      setStatus('JPG, JPEG, PNG, WEBP 파일만 업로드할 수 있습니다.', 'error');
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setStatus('이미지 파일은 0바이트보다 크고 25MB 이하여야 합니다.', 'error');
      return;
    }

    setStatus('이미지를 확인하고 있습니다.');
    let temporaryUrl = null;
    try {
      if (!(await hasCorrectSignature(file, mime))) {
        throw new Error('파일의 실제 이미지 형식이 JPG, PNG 또는 WEBP와 일치하지 않습니다.');
      }
      if (selectionId !== state.selectionVersion) return;
      temporaryUrl = URL.createObjectURL(file);
      const image = await loadImageFromUrl(temporaryUrl);
      if (selectionId !== state.selectionVersion) {
        releaseUrl(temporaryUrl);
        return;
      }
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
        throw new Error('이미지가 너무 큽니다. 2,400만 화소, 한 변 10,000px 이하 이미지를 선택해주세요.');
      }

      state.file = file;
      state.sourceMime = mime;
      state.image = image;
      state.originalUrl = temporaryUrl;
      temporaryUrl = null;
      $('#fileName').text(file.name);
      $('#fileSize').text(formatBytes(file.size));
      $('#fileResolution').text(formatResolution(width, height));
      $('#fileInfo').prop('hidden', false);
      $('#originalPreview').attr('src', state.originalUrl).prop('hidden', false);
      $('#originalPlaceholder').prop('hidden', true);
      $('#originalPreviewSize').text(formatBytes(file.size) + ' · ' + width + ' × ' + height);
      selectFormat(mime, false); // 처음 열 때 원본과 같은 형식을 기본으로 선택
      updateFormatNotice();
      setStatus('이미지 준비 완료. 목표 용량을 선택하고 압축해주세요.');
      updateCompressButton();
    } catch (error) {
      if (selectionId !== state.selectionVersion) return;
      clearFile();
      setStatus(error.message || '이미지를 읽는 중 오류가 발생했습니다.', 'error');
    } finally {
      if (temporaryUrl) releaseUrl(temporaryUrl);
    }
  }

  function pauseForRepaint() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (!blob) {
            reject(new Error('이미지를 저장할 수 없습니다. 브라우저 메모리 또는 형식을 확인해주세요.'));
            return;
          }
          if (blob.type.toLowerCase() !== mime) {
            reject(new Error(MIME_OPTIONS[mime].label + ' 출력이 지원되지 않습니다. 다른 브라우저나 저장 형식을 사용해주세요.'));
            return;
          }
          resolve(blob);
        }, mime, quality);
      } catch (error) {
        reject(new Error('이미지 인코딩 중 오류가 발생했습니다. 이미지 크기를 줄여 시도해주세요.'));
      }
    });
  }

  async function compressImage(sourceImage, outputMime, targetBytes, sourceBlob, sourceMime) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: outputMime !== 'image/jpeg' });
    if (!context) throw new Error('현재 브라우저에서 이미지 편집을 사용할 수 없습니다.');

    const originalWidth = sourceImage.naturalWidth;
    const originalHeight = sourceImage.naturalHeight;
    const longestSide = Math.max(originalWidth, originalHeight);
    const minimumSide = Math.min(MIN_LONG_EDGE, longestSide);
    let attempts = 0;
    let smallest = null;

    // 이미 목표 크기 이하이고 형식이 같으면 원본 파일을 재인코딩하지 않습니다.
    if (sourceMime === outputMime && sourceBlob.size <= targetBytes) {
      return { blob: sourceBlob, width: originalWidth, height: originalHeight, unchanged: true };
    }

    function rememberIfSmallest(blob, width, height) {
      if (!smallest || blob.size < smallest.blob.size) {
        smallest = { blob, width, height, unchanged: false };
      }
    }

    async function encode(quality) {
      ++attempts;
      return canvasToBlob(canvas, outputMime, quality);
    }

    try {
      for (let step = 0; step <= MAX_RESIZE_STEPS && attempts < MAX_ENCODE_ATTEMPTS; step++) {
        const scale = Math.pow(RESIZE_FACTOR, step);
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));
        if (step > 0 && Math.max(width, height) < minimumSide) break;
        canvas.width = width;
        canvas.height = height;
        if (outputMime === 'image/jpeg') {
          // JPEG는 알파 채널이 없어 투명 영역을 흰색으로 합성합니다.
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
        } else {
          context.clearRect(0, 0, width, height);
        }
        context.drawImage(sourceImage, 0, 0, width, height);
        setStatus('이미지를 압축하고 있습니다. (' + (step + 1) + '단계 · ' + width + ' × ' + height + ')');
        await pauseForRepaint();

        if (outputMime === 'image/png') {
          // Canvas PNG는 품질 매개변수로 용량 제어 불가: 해상도만 단계적으로 조정
          const pngBlob = await encode(undefined);
          rememberIfSmallest(pngBlob, width, height);
          if (pngBlob.size <= targetBytes) return { blob: pngBlob, width, height, unchanged: false };
          continue;
        }

        let high = QUALITY_HIGH;
        let low = QUALITY_LOW;
        const highBlob = await encode(high);
        rememberIfSmallest(highBlob, width, height);
        if (highBlob.size <= targetBytes) return { blob: highBlob, width, height, unchanged: false };

        const lowBlob = await encode(low);
        rememberIfSmallest(lowBlob, width, height);
        if (lowBlob.size > targetBytes) continue;

        // 목표를 만족하는 품질 중 가능한 높은 품질을 이진 탐색합니다.
        let bestFittingBlob = lowBlob;
        for (let i = 0; i < MAX_BINARY_STEPS && attempts < MAX_ENCODE_ATTEMPTS; i++) {
          const mid = (low + high) / 2;
          const candidate = await encode(mid);
          rememberIfSmallest(candidate, width, height);
          if (candidate.size <= targetBytes) {
            bestFittingBlob = candidate;
            low = mid;
          } else {
            high = mid;
          }
        }
        return { blob: bestFittingBlob, width, height, unchanged: false };
      }

      if (!smallest) throw new Error('압축된 파일을 만들지 못했습니다.');
      // 같은 형식에서는 목표 달성 실패 시 원본보다 더 커진 결과를 억지로 주지 않습니다.
      if (sourceMime === outputMime && sourceBlob.size <= smallest.blob.size) {
        return { blob: sourceBlob, width: originalWidth, height: originalHeight, unchanged: true };
      }
      return smallest;
    } finally {
      // 캔버스 픽셀 버퍼 해제
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  function showResult(result, targetKB) {
    const { blob, width, height, unchanged } = result;
    const originalBytes = state.file.size;
    const diff = originalBytes - blob.size;
    const rate = Math.abs(diff / originalBytes * 100);
    const achieved = blob.size <= targetKB * KB;
    const sourceWidth = state.image.naturalWidth;
    const sourceHeight = state.image.naturalHeight;
    const metric = $('#reductionRate').removeClass('is-growth');

    if (diff > 0) {
      $('#reductionLabel').text('용량 감소율');
      metric.text(trimTrailingZeros(rate, 1) + '%');
      $('#reductionDetail').text(formatBytes(diff) + ' 감소');
    } else if (diff < 0) {
      $('#reductionLabel').text('용량 증가율');
      metric.addClass('is-growth').text(trimTrailingZeros(rate, 1) + '%');
      $('#reductionDetail').text(formatBytes(-diff) + ' 증가');
    } else {
      $('#reductionLabel').text('용량 변화 없음');
      metric.text('0%');
      $('#reductionDetail').text('파일 크기 변화 없음');
    }

    $('#resultOriginalSize').text(formatBytes(originalBytes));
    $('#resultCompressedSize').text(formatBytes(blob.size));
    $('#resultOriginalResolution').text(formatResolution(sourceWidth, sourceHeight));
    $('#resultOutputResolution').text(formatResolution(width, height));
    $('#resultFormat').text(MIME_OPTIONS[state.selectedMime].label);
    $('#resultTarget').text(formatTarget(targetKB));
    $('#resultOutcome').toggleClass('is-missed', !achieved)
      .text(achieved ? '✓ 목표 용량을 달성했습니다.' : '! 목표 용량에 도달하지 못했습니다.');

    let guidance = '';
    if (unchanged && state.sourceMime === state.selectedMime && originalBytes <= targetKB * KB) {
      guidance = '원본 파일이 이미 목표 용량 이하이므로 화질 손실 없이 원본을 그대로 사용했습니다.';
    } else if (!achieved) {
      guidance = '화질 저하와 해상도 축소에 한계를 두었습니다. 더 큰 목표 용량 또는 JPEG/WEBP 형식을 선택해보세요.';
    } else if (width < sourceWidth || height < sourceHeight) {
      guidance = '목표 용량을 맞추기 위해 이미지 해상도가 축소되었습니다.';
    }
    $('#resultGuidance').text(guidance).prop('hidden', !guidance);

    state.resultBlob = blob;
    state.resultMime = state.selectedMime;
    state.resultUrl = URL.createObjectURL(blob);
    $('#resultPreview').attr('src', state.resultUrl).prop('hidden', false);
    $('#resultPlaceholder').prop('hidden', true);
    $('#resultPreviewSize').text(formatBytes(blob.size) + ' · ' + width + ' × ' + height);
    $('#resultPanel').prop('hidden', false);
    $downloadButton.prop('disabled', false);
    setStatus(achieved ? '압축이 완료되었습니다. 목표 용량을 달성했습니다.' : '압축이 완료되었지만 목표 용량에 도달하지 못했습니다.', achieved ? 'success' : '');
  }

  async function handleCompress() {
    if (state.isProcessing || !state.file || !state.image) return;
    const targetKB = getTargetKB();
    if (targetKB === null) {
      setStatus('직접 입력 용량은 10~25,600KB 사이의 정수여야 합니다.', 'error');
      return;
    }
    clearResult();
    state.isProcessing = true;
    setControlsDisabled(true);
    setStatus('이미지를 압축하고 있습니다.');
    await pauseForRepaint();

    try {
      const result = await compressImage(state.image, state.selectedMime, targetKB * KB, state.file, state.sourceMime);
      if (result.blob.type !== state.selectedMime || !(await hasCorrectSignature(result.blob, state.selectedMime))) {
        throw new Error('결과 파일의 실제 형식이 선택한 형식과 일치하지 않습니다.');
      }
      showResult(result, targetKB);
    } catch (error) {
      clearResult();
      setStatus(error.message || '압축 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    } finally {
      state.isProcessing = false;
      setControlsDisabled(false);
    }
  }

  function downloadResult() {
    if (!state.resultBlob || !state.resultUrl || !state.resultMime) return;
    const originalName = state.file.name.replace(/\.[^.]+$/, '');
    const baseName = originalName.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_') || 'image';
    const fileName = baseName + '-pixcompress.' + MIME_OPTIONS[state.resultMime].ext;
    const link = document.createElement('a');
    link.href = state.resultUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  $imageInput.on('change', function () {
    const files = this.files;
    void handleFileSelection(files);
    this.value = ''; // 같은 파일도 재선택할 수 있습니다.
  });

  $uploadArea.on('dragenter dragover', function (event) {
    event.preventDefault();
    if (state.isProcessing) return;
    event.originalEvent.dataTransfer.dropEffect = 'copy';
    $(this).addClass('is-dragging');
  }).on('dragleave drop', function (event) {
    event.preventDefault();
    $(this).removeClass('is-dragging');
    if (event.type === 'drop') void handleFileSelection(event.originalEvent.dataTransfer.files);
  });

  // 파일을 페이지 바깥에 드롭해 브라우저가 이동해 버리는 것을 막습니다.
  $(document).on('dragover drop', function (event) {
    if (event.originalEvent.dataTransfer && Array.from(event.originalEvent.dataTransfer.types || []).includes('Files')) {
      event.preventDefault();
    }
  });

  $targetButtons.on('click', function () { selectTarget(String($(this).data('kb')), true); });
  $customInput.on('input change', function () {
    if (state.isProcessing) return;
    const targetKB = getCustomTargetKB();
    const hadInvalidCustomTarget = state.customTargetInvalid;
    state.customTargetInvalid = targetKB === null;
    updateTargetSummary();
    if (targetKB === null) {
      invalidateResult('10~25,600KB 사이의 정수를 입력해주세요.', 'error');
    } else if (targetKB !== state.lastValidTargetKB) {
      state.lastValidTargetKB = targetKB;
      invalidateResult(hadInvalidCustomTarget
        ? '목표 용량이 설정되었습니다. 이미지를 다시 압축해주세요.'
        : '목표 용량이 변경되었습니다. 다시 압축해주세요.');
    } else if (hadInvalidCustomTarget) {
      setStatus('목표 용량이 설정되었습니다. 이미지를 다시 압축해주세요.');
    }
  });
  $formatButtons.on('click', function () { selectFormat(String($(this).data('format')), true); });
  $compressButton.on('click', function () { void handleCompress(); });
  $downloadButton.on('click', downloadResult);
  $(window).on('pagehide', function () { releaseUrl(state.originalUrl); releaseUrl(state.resultUrl); });

  updateTargetSummary();
  updateFormatNotice();
  updateCompressButton();
})(jQuery);
