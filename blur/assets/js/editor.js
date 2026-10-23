(function (global) {
  "use strict";

  const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4];
  const cloneAreas = function (areas) { return areas.map(function (area) { return Object.assign({}, area); }); };

  class CanvasEditor {
    constructor(canvas, stage, onChange) {
      this.canvas = canvas;
      this.stage = stage;
      this.context = canvas.getContext("2d", { willReadFrequently: true });
      this.onChange = onChange;
      this.image = null;
      this.imageWidth = 0;
      this.imageHeight = 0;
      this.areas = [];
      this.selectedId = null;
      this.tool = "mosaic";
      this.strength = "medium";
      this.coverColor = "#000000";
      this.outputFormat = "png";
      this.addMode = false;
      this.panMode = false;
      this.comparing = false;
      this.selectionBeforeCompare = null;
      this.zoomIndex = 0;
      this.panX = 0;
      this.panY = 0;
      this.history = [];
      this.historyIndex = -1;
      this.drag = null;
      this.pixelRatio = 1;
      this.frame = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(stage);
      canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
      canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
      canvas.addEventListener("pointerup", (event) => this.pointerEnd(event, false));
      canvas.addEventListener("pointercancel", (event) => this.pointerEnd(event, true));
      canvas.addEventListener("lostpointercapture", (event) => {
        if (this.drag && this.drag.pointerId === event.pointerId) this.pointerEnd(event, true);
      });
      this.resize();
    }

    get fitScale() {
      if (!this.imageWidth || !this.canvas.clientWidth || !this.canvas.clientHeight) return 1;
      return Math.min(this.canvas.clientWidth / this.imageWidth, this.canvas.clientHeight / this.imageHeight);
    }

    get scale() { return this.fitScale * ZOOM_STEPS[this.zoomIndex]; }

    get imageRect() {
      const scale = this.scale;
      return {
        x: (this.canvas.clientWidth - this.imageWidth * scale) / 2 + this.panX,
        y: (this.canvas.clientHeight - this.imageHeight * scale) / 2 + this.panY,
        width: this.imageWidth * scale,
        height: this.imageHeight * scale
      };
    }

    resize() {
      const rect = this.stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.pixelRatio = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(rect.width * this.pixelRatio);
      this.canvas.height = Math.round(rect.height * this.pixelRatio);
      this.render();
    }

    load(image, width, height) {
      this.image = image;
      this.imageWidth = width;
      this.imageHeight = height;
      this.areas = [];
      this.selectedId = null;
      this.zoomIndex = 0;
      this.panX = 0;
      this.panY = 0;
      this.history = [];
      this.historyIndex = -1;
      this.pushHistory();
      this.notify();
      this.render();
    }

    unload() {
      this.image = null;
      this.imageWidth = 0;
      this.imageHeight = 0;
      this.areas = [];
      this.selectedId = null;
      this.history = [];
      this.historyIndex = -1;
      this.render();
    }

    setTool(tool) {
      const selected = this.selectedArea;
      if (selected && selected.type !== tool) {
        this.beginHistory();
        selected.type = tool;
        if (tool !== "cover") selected.strength = this.strength;
        else selected.color = this.coverColor;
        this.commitHistory();
      }
      this.tool = tool;
      this.addMode = false;
      this.notify();
      this.render();
    }

    setStrength(strength) {
      const area = this.selectedArea;
      if (area && area.type !== "cover") {
        if (area.strength === strength) return;
        this.beginHistory();
        area.strength = strength;
        this.commitHistory();
      } else {
        this.strength = strength;
        this.notify();
      }
      this.render();
    }

    setCoverColor(color) {
      const area = this.selectedArea;
      if (area && area.type === "cover") {
        if (area.color === color) return;
        this.beginHistory();
        area.color = color;
        this.commitHistory();
      } else {
        this.coverColor = color;
        this.notify();
      }
      this.render();
    }

    setOutputFormat(format) {
      if (format === this.outputFormat) return;
      this.outputFormat = format;
      this.render();
    }

    get selectedArea() { return this.areas.find((area) => area.id === this.selectedId) || null; }

    select(id) {
      this.selectedId = id;
      this.addMode = false;
      this.notify();
      this.render();
    }

    enableAddMode() {
      this.addMode = !this.addMode;
      this.selectedId = null;
      this.notify();
      this.render();
    }

    deleteSelected() {
      if (!this.selectedId) return;
      this.beginHistory();
      this.areas = this.areas.filter((area) => area.id !== this.selectedId);
      this.selectedId = null;
      this.commitHistory();
      this.render();
    }

    clearAreas() {
      if (!this.areas.length) return;
      this.beginHistory();
      this.areas = [];
      this.selectedId = null;
      this.commitHistory();
      this.render();
    }

    undo() {
      if (this.historyIndex <= 0) return;
      this.historyIndex -= 1;
      this.restoreHistory();
    }

    redo() {
      if (this.historyIndex >= this.history.length - 1) return;
      this.historyIndex += 1;
      this.restoreHistory();
    }

    get canUndo() { return this.historyIndex > 0; }
    get canRedo() { return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1; }

    beginHistory() { this.dragHistoryStart = JSON.stringify(this.areas); }

    commitHistory() {
      const serialized = JSON.stringify(this.areas);
      if (serialized !== this.dragHistoryStart) {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(cloneAreas(this.areas));
        if (this.history.length > 21) this.history.shift();
        this.historyIndex = this.history.length - 1;
      }
      this.dragHistoryStart = null;
      this.notify();
    }

    pushHistory() {
      this.history.push(cloneAreas(this.areas));
      this.historyIndex = this.history.length - 1;
    }

    restoreHistory() {
      this.areas = cloneAreas(this.history[this.historyIndex]);
      if (!this.areas.some((area) => area.id === this.selectedId)) this.selectedId = null;
      this.notify();
      this.render();
    }

    setZoom(index) {
      const nextIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index));
      if (nextIndex === this.zoomIndex) return;
      const oldScale = this.scale;
      const centerX = this.canvas.clientWidth / 2;
      const centerY = this.canvas.clientHeight / 2;
      const imageX = (centerX - this.imageRect.x) / oldScale;
      const imageY = (centerY - this.imageRect.y) / oldScale;
      this.zoomIndex = nextIndex;
      const newScale = this.scale;
      this.panX = centerX - imageX * newScale - (this.canvas.clientWidth - this.imageWidth * newScale) / 2;
      this.panY = centerY - imageY * newScale - (this.canvas.clientHeight - this.imageHeight * newScale) / 2;
      this.notify();
      this.render();
    }

    fit() {
      this.zoomIndex = 0;
      this.panX = 0;
      this.panY = 0;
      this.notify();
      this.render();
    }

    setPanMode(enabled) {
      this.panMode = enabled;
      this.canvas.classList.toggle("pan-active", enabled);
      this.notify();
    }

    setComparing(enabled) {
      if (enabled === this.comparing) return;
      this.comparing = enabled;
      if (enabled) {
        this.selectionBeforeCompare = this.selectedId;
        this.selectedId = null;
      } else {
        this.selectedId = this.areas.some((area) => area.id === this.selectionBeforeCompare) ? this.selectionBeforeCompare : null;
        this.selectionBeforeCompare = null;
      }
      this.notify();
      this.render();
    }

    notify() { this.onChange(this); }

    pointerPosition(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    toImagePoint(point) {
      const rect = this.imageRect;
      return { x: (point.x - rect.x) / this.scale, y: (point.y - rect.y) / this.scale };
    }

    areaAt(point) {
      const imagePoint = this.toImagePoint(point);
      const displayOrder = global.PixBlurEffects.orderedAreas(this.areas);
      for (let index = displayOrder.length - 1; index >= 0; index -= 1) {
        const area = displayOrder[index];
        if (imagePoint.x >= area.x && imagePoint.x <= area.x + area.width &&
            imagePoint.y >= area.y && imagePoint.y <= area.y + area.height) return area;
      }
      return null;
    }

    handleAt(point, area, pointerType) {
      if (!area) return null;
      const rect = this.imageRect;
      const hitRadius = pointerType === "touch" ? 22 : 11;
      const corners = {
        nw: { x: rect.x + area.x * this.scale, y: rect.y + area.y * this.scale },
        ne: { x: rect.x + (area.x + area.width) * this.scale, y: rect.y + area.y * this.scale },
        sw: { x: rect.x + area.x * this.scale, y: rect.y + (area.y + area.height) * this.scale },
        se: { x: rect.x + (area.x + area.width) * this.scale, y: rect.y + (area.y + area.height) * this.scale }
      };
      for (const [key, corner] of Object.entries(corners)) {
        if (Math.abs(point.x - corner.x) <= hitRadius && Math.abs(point.y - corner.y) <= hitRadius) return key;
      }
      return null;
    }

    pointerDown(event) {
      if (!this.image || this.comparing) return;
      const point = this.pointerPosition(event);
      const imagePoint = this.toImagePoint(point);
      if (this.panMode) {
        this.drag = { kind: "pan", pointerId: event.pointerId, start: point, panX: this.panX, panY: this.panY };
        this.canvas.classList.add("is-panning");
      } else {
        const selected = this.selectedArea;
        const handle = selected && !this.addMode ? this.handleAt(point, selected, event.pointerType) : null;
        const hit = this.addMode ? null : this.areaAt(point);
        if (handle) {
          this.drag = { kind: "resize", handle: handle, pointerId: event.pointerId, start: imagePoint, original: Object.assign({}, selected) };
          this.beginHistory();
        } else if (hit) {
          this.selectedId = hit.id;
          this.drag = { kind: "move", pointerId: event.pointerId, start: imagePoint, original: Object.assign({}, hit) };
          this.beginHistory();
        } else if (imagePoint.x >= 0 && imagePoint.y >= 0 && imagePoint.x <= this.imageWidth && imagePoint.y <= this.imageHeight) {
          this.selectedId = null;
          this.beginHistory();
          const area = {
            id: "area-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
            x: imagePoint.x, y: imagePoint.y, width: 0, height: 0,
            type: this.tool, strength: this.strength, color: this.coverColor
          };
          this.areas.push(area);
          this.selectedId = area.id;
          this.drag = { kind: "create", pointerId: event.pointerId, start: imagePoint, original: Object.assign({}, area) };
        } else {
          this.selectedId = null;
          this.addMode = false;
        }
      }
      this.canvas.setPointerCapture(event.pointerId);
      this.notify();
      this.render();
    }

    pointerMove(event) {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const point = this.pointerPosition(event);
      if (this.drag.kind === "pan") {
        this.panX = this.drag.panX + point.x - this.drag.start.x;
        this.panY = this.drag.panY + point.y - this.drag.start.y;
      } else {
        const current = this.toImagePoint(point);
        const area = this.selectedArea;
        if (!area) return;
        if (this.drag.kind === "create") {
          const start = this.drag.start;
          const x = Math.max(0, Math.min(start.x, current.x));
          const y = Math.max(0, Math.min(start.y, current.y));
          area.x = x; area.y = y;
          area.width = Math.max(0, Math.min(this.imageWidth, Math.max(start.x, current.x)) - x);
          area.height = Math.max(0, Math.min(this.imageHeight, Math.max(start.y, current.y)) - y);
        } else if (this.drag.kind === "move") {
          const dx = current.x - this.drag.start.x;
          const dy = current.y - this.drag.start.y;
          area.x = Math.max(0, Math.min(this.imageWidth - area.width, this.drag.original.x + dx));
          area.y = Math.max(0, Math.min(this.imageHeight - area.height, this.drag.original.y + dy));
        } else if (this.drag.kind === "resize") {
          this.resizeArea(area, current);
        }
      }
      this.queueRender();
    }

    resizeArea(area, current) {
      const original = this.drag.original;
      let left = original.x;
      let top = original.y;
      let right = original.x + original.width;
      let bottom = original.y + original.height;
      if (this.drag.handle.includes("w")) left = Math.max(0, Math.min(right - 2, current.x));
      if (this.drag.handle.includes("e")) right = Math.min(this.imageWidth, Math.max(left + 2, current.x));
      if (this.drag.handle.includes("n")) top = Math.max(0, Math.min(bottom - 2, current.y));
      if (this.drag.handle.includes("s")) bottom = Math.min(this.imageHeight, Math.max(top + 2, current.y));
      area.x = left; area.y = top; area.width = right - left; area.height = bottom - top;
    }

    pointerEnd(event, cancelled) {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      const drag = this.drag;
      this.drag = null;
      this.canvas.classList.remove("is-panning");
      if (cancelled && drag.kind !== "pan") {
        this.areas = cloneAreas(this.history[this.historyIndex]);
        this.selectedId = null;
      } else if (drag.kind === "create") {
        const area = this.selectedArea;
        if (!area || area.width < 2 || area.height < 2) {
          this.areas = this.areas.filter((item) => item.id !== this.selectedId);
          this.selectedId = null;
        }
        this.commitHistory();
      } else if (drag.kind === "move" || drag.kind === "resize") {
        this.commitHistory();
      }
      this.addMode = false;
      this.notify();
      this.render();
    }

    queueRender() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.render();
      });
    }

    render() {
      const context = this.context;
      const ratio = this.pixelRatio;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.image) return;
      const rect = this.imageRect;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (this.outputFormat === "jpg") {
        context.fillStyle = "#ffffff";
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
      context.drawImage(this.image, rect.x, rect.y, rect.width, rect.height);
      if (!this.comparing) {
        const sourceScale = this.scale * ratio;
        const mappingFor = (area) => ({
          x: (rect.x + area.x * this.scale) * ratio,
          y: (rect.y + area.y * this.scale) * ratio,
          width: area.width * sourceScale,
          height: area.height * sourceScale,
          sourceScale: sourceScale,
          originX: rect.x * ratio,
          originY: rect.y * ratio,
          format: this.outputFormat
        });
        for (const area of global.PixBlurEffects.orderedAreas(this.areas)) {
          global.PixBlurEffects.applyRegion(context, area, mappingFor(area));
        }
        this.drawSelection(context, rect, ratio);
      }
    }

    drawSelection(context, rect, ratio) {
      const area = this.selectedArea;
      if (!area) return;
      const x = rect.x + area.x * this.scale;
      const y = rect.y + area.y * this.scale;
      const width = area.width * this.scale;
      const height = area.height * this.scale;
      context.save();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "rgba(255, 122, 11, .10)";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#ff7a0b";
      context.lineWidth = 1.5;
      context.setLineDash([5, 3]);
      context.strokeRect(x, y, width, height);
      context.setLineDash([]);
      const size = 8;
      const half = size / 2;
      const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
      context.fillStyle = "#fff";
      context.strokeStyle = "#c55200";
      context.lineWidth = 1.5;
      corners.forEach(([cx, cy]) => {
        context.fillRect(cx - half, cy - half, size, size);
        context.strokeRect(cx - half, cy - half, size, size);
      });
      context.restore();
    }
  }

  global.PixBlurEditor = CanvasEditor;
}(window));
