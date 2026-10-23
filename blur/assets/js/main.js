(function () {
  "use strict";

  const MAX_BYTES = 20 * 1024 * 1024;
  const MAX_DIMENSION = 4096;
  const byId = (id) => document.getElementById(id);
  const canvas = byId("editor-canvas");
  const stage = byId("canvas-stage");
  const fileInput = byId("file-input");
  const editor = new window.PixBlurEditor(canvas, stage, updateUI);
  const mobileTools = window.matchMedia("(max-width: 767px)");
  const toolSections = [byId("tool-section"), byId("effect-settings")];
  const mobileToolSlot = byId("mobile-tool-slot");
  const areasSection = document.querySelector(".areas-section");
  let currentFile = null;
  let currentImage = null;
  let currentFormat = "png";
  let toastTimer = 0;
  let dropDepth = 0;
  let saving = false;

  function positionToolSections() {
    if (mobileTools.matches) {
      toolSections.forEach((section) => mobileToolSlot.appendChild(section));
      mobileToolSlot.hidden = false;
    } else {
      toolSections.forEach((section) => settingsPanel.insertBefore(section, areasSection));
      mobileToolSlot.hidden = true;
    }
  }

  const settingsPanel = document.querySelector(".settings-panel");
  positionToolSections();
  if (typeof mobileTools.addEventListener === "function") mobileTools.addEventListener("change", positionToolSections);
  else mobileTools.addListener(positionToolSections);

  function showToast(message) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + "KB";
    return (bytes / (1024 * 1024)).toFixed(2) + "MB";
  }

  function updateUI(instance) {
    const loaded = Boolean(currentImage);
    document.querySelectorAll(".tool-button, [data-strength], [data-color], [data-format]").forEach((button) => {
      button.disabled = !loaded || saving;
    });
    ["change-image", "add-area", "clear-areas", "delete-area", "undo", "redo", "compare", "fit", "zoom-out", "zoom-in", "pan-mode", "download"]
      .forEach((id) => { byId(id).disabled = !loaded || saving; });
    byId("delete-area").disabled = !loaded || !instance.selectedId || saving;
    byId("clear-areas").disabled = !loaded || !instance.areas.length || saving;
    byId("undo").disabled = !loaded || !instance.canUndo || saving;
    byId("redo").disabled = !loaded || !instance.canRedo || saving;
    byId("compare").classList.toggle("is-comparing", instance.comparing);
    byId("compare").textContent = instance.comparing ? "원본 보기 중" : "원본 보기";
    byId("pan-mode").setAttribute("aria-pressed", String(instance.panMode));
    byId("pan-mode").classList.toggle("is-active", instance.panMode);
    byId("zoom-value").textContent = Math.round([100, 125, 150, 200, 300, 400][instance.zoomIndex]) + "%";
    byId("zoom-out").disabled = !loaded || instance.zoomIndex === 0 || saving;
    byId("zoom-in").disabled = !loaded || instance.zoomIndex === 5 || saving;
    byId("canvas-hint").textContent = instance.panMode ? "이미지를 드래그해 이동하세요."
      : instance.selectedId ? "선택 영역을 이동하거나 모서리에서 크기를 조절하세요."
        : instance.addMode ? "이미지 위를 드래그해 새 영역을 추가하세요." : "가릴 영역을 드래그해 선택하세요.";
    document.querySelectorAll(".tool-button").forEach((button) => {
      const active = button.dataset.tool === instance.tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const selected = instance.selectedArea;
    const currentType = selected ? selected.type : instance.tool;
    byId("strength-options").hidden = currentType === "cover";
    byId("cover-options").hidden = currentType !== "cover";
    byId("setting-title").textContent = currentType === "cover" ? "가리기 색상" : "효과 강도";
    byId("setting-subtitle").textContent = currentType === "cover" ? "Cover Color" : "Effect Strength";
    const strength = selected && selected.type !== "cover" ? selected.strength : instance.strength;
    document.querySelectorAll("[data-strength]").forEach((button) => {
      const active = button.dataset.strength === strength;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const coverColor = selected && selected.type === "cover" ? selected.color : instance.coverColor;
    document.querySelectorAll("[data-color]").forEach((button) => {
      const active = button.dataset.color === coverColor;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    byId("add-area").textContent = instance.addMode ? "✓ 새 영역 추가 중" : "＋ 새 영역 추가";
    byId("add-area").classList.toggle("is-active", instance.addMode);
    byId("add-area").setAttribute("aria-pressed", String(instance.addMode));
    byId("area-count").textContent = String(instance.areas.length);
    renderAreaList(instance);
    byId("image-dimensions").textContent = loaded ? instance.imageWidth + " × " + instance.imageHeight + "px" : "이미지를 업로드해주세요";
  }

  function renderAreaList(instance) {
    const list = byId("area-list");
    list.replaceChildren();
    if (!instance.areas.length) {
      const empty = document.createElement("p");
      empty.className = "empty-areas";
      empty.textContent = "아직 편집한 영역이 없습니다.";
      list.appendChild(empty);
      return;
    }
    instance.areas.forEach((area, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "area-row" + (area.id === instance.selectedId ? " is-selected" : "");
      button.setAttribute("aria-pressed", String(area.id === instance.selectedId));
      const swatch = document.createElement("span");
      swatch.className = "area-swatch";
      swatch.style.backgroundColor = area.type === "cover" ? area.color : area.type === "blur" ? "#8c9ca8" : "#ff7a0b";
      const number = document.createElement("span");
      number.className = "area-row-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.className = "area-row-label";
      label.textContent = area.type === "cover" ? (area.color === "#ffffff" ? "흰색 가리기" : "검정색 가리기")
        : (area.type === "mosaic" ? "모자이크" : "블러") + " · " + ({ weak: "약함", medium: "보통", strong: "강함" }[area.strength]);
      button.append(swatch, number, label);
      button.addEventListener("click", () => editor.select(area.id));
      list.appendChild(button);
    });
  }

  function imageFileError(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(extension)) return "JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.";
    if (file.size > MAX_BYTES) return "최대 20MB 이하의 이미지를 선택해주세요.";
    return "";
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (error) {
        if (error && error.name !== "TypeError" && error.name !== "NotSupportedError") throw error;
      }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("이미지 디코딩 실패"));
      };
      image.src = url;
    });
  }

  async function loadFile(file) {
    if (!file) return;
    const error = imageFileError(file);
    if (error) { showToast(error); fileInput.value = ""; return; }
    if (currentImage && editor.areas.length && !window.confirm("현재 편집 내용이 초기화됩니다. 새 이미지를 불러오시겠습니까?")) {
      fileInput.value = "";
      return;
    }
    try {
      const image = await decodeImage(file);
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;
      if (!width || !height) throw new Error("이미지 크기를 확인할 수 없습니다.");
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (typeof image.close === "function") image.close();
        showToast("가로와 세로가 각각 4,096px 이하인 이미지를 선택해주세요.");
        fileInput.value = "";
        return;
      }
      if (currentImage && currentImage !== image && typeof currentImage.close === "function") currentImage.close();
      currentImage = image;
      currentFile = file;
      canvas.hidden = false;
      byId("empty-upload").hidden = true;
      editor.load(image, width, height);
      editor.resize();
      byId("image-info").classList.remove("empty-info");
      byId("image-info").innerHTML = '<div class="info-empty-icon" aria-hidden="true">▧</div><div class="image-file-copy"><p class="file-info-name"></p><p class="file-info-meta"></p></div>';
      byId("image-info").querySelector(".file-info-name").textContent = file.name;
      byId("image-info").querySelector(".file-info-meta").textContent = width + " × " + height + "px · " + formatBytes(file.size);
      fileInput.value = "";
    } catch (error) {
      console.error("PixBlur image decode failed", error);
      showToast("이미지 파일을 열 수 없습니다. 다른 파일을 선택해주세요.");
      fileInput.value = "";
    }
  }

  byId("select-image").addEventListener("click", () => fileInput.click());
  byId("change-image").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => loadFile(fileInput.files && fileInput.files[0]));
  document.querySelectorAll(".tool-button").forEach((button) => button.addEventListener("click", () => editor.setTool(button.dataset.tool)));
  document.querySelectorAll("[data-strength]").forEach((button) => button.addEventListener("click", () => editor.setStrength(button.dataset.strength)));
  document.querySelectorAll("[data-color]").forEach((button) => button.addEventListener("click", () => editor.setCoverColor(button.dataset.color)));
  document.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
    currentFormat = button.dataset.format;
    editor.setOutputFormat(currentFormat);
    document.querySelectorAll("[data-format]").forEach((option) => {
      const active = option === button;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-pressed", String(active));
    });
    byId("format-note").textContent = currentFormat === "jpg"
      ? "JPG는 흰 배경·손실 압축이며 가리기 경계가 확장됩니다."
      : "투명 배경을 유지해 저장합니다.";
  }));
  byId("add-area").addEventListener("click", () => editor.enableAddMode());
  byId("delete-area").addEventListener("click", () => editor.deleteSelected());
  byId("clear-areas").addEventListener("click", () => {
    if (window.confirm("모든 편집 영역을 초기화하시겠습니까?")) editor.clearAreas();
  });
  byId("undo").addEventListener("click", () => editor.undo());
  byId("redo").addEventListener("click", () => editor.redo());
  byId("zoom-in").addEventListener("click", () => editor.setZoom(editor.zoomIndex + 1));
  byId("zoom-out").addEventListener("click", () => editor.setZoom(editor.zoomIndex - 1));
  byId("fit").addEventListener("click", () => editor.fit());
  byId("pan-mode").addEventListener("click", () => editor.setPanMode(!editor.panMode));

  const compareButton = byId("compare");
  compareButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    editor.setComparing(true);
    compareButton.setPointerCapture(event.pointerId);
  });
  ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"].forEach((name) =>
    compareButton.addEventListener(name, () => editor.setComparing(false)));
  compareButton.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") editor.setComparing(true);
  });
  compareButton.addEventListener("keyup", () => editor.setComparing(false));
  compareButton.addEventListener("blur", () => editor.setComparing(false));

  byId("download").addEventListener("click", async () => {
    if (!currentImage || saving) return;
    saving = true;
    updateUI(editor);
    try {
      await window.PixBlurExport.download(currentImage, editor.imageWidth, editor.imageHeight, editor.areas, currentFile.name, currentFormat);
    } catch (error) {
      console.error("PixBlur export failed", error);
      showToast("이미지 저장에 실패했습니다. 편집 내용은 유지됩니다.");
    } finally {
      saving = false;
      updateUI(editor);
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
      event.preventDefault();
      editor.redo();
    } else if ((event.key === "Delete" || event.key === "Backspace") && editor.selectedId) {
      event.preventDefault();
      editor.deleteSelected();
    }
  });

  stage.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dropDepth += 1;
    byId("drop-overlay").hidden = false;
  });
  stage.addEventListener("dragover", (event) => event.preventDefault());
  stage.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) byId("drop-overlay").hidden = true;
  });
  stage.addEventListener("drop", (event) => {
    event.preventDefault();
    dropDepth = 0;
    byId("drop-overlay").hidden = true;
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  updateUI(editor);
}());
