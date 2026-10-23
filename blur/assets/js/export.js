(function (global) {
  "use strict";

  function renderOutput(image, width, height, areas, format) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas를 만들 수 없습니다.");
    if (format === "jpg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const mappingFor = (area) => ({
      x: area.x, y: area.y, width: area.width, height: area.height, sourceScale: 1,
      originX: 0, originY: 0, format: format
    });
    global.PixBlurEffects.orderedAreas(areas).forEach((area) => {
      global.PixBlurEffects.applyRegion(context, area, mappingFor(area));
    });
    return canvas;
  }

  function canvasBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("이미지 인코딩에 실패했습니다."));
      }, mimeType, mimeType === "image/jpeg" ? .95 : undefined);
    });
  }

  function baseName(fileName) {
    return fileName.replace(/\.[^.]*$/, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "image";
  }

  async function download(image, width, height, areas, fileName, format) {
    let canvas;
    let objectUrl;
    try {
      canvas = renderOutput(image, width, height, areas, format);
      const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
      const blob = await canvasBlob(canvas, mimeType);
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = baseName(fileName) + "-pixblur." + format;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      if (objectUrl) global.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  global.PixBlurExport = { download: download, renderOutput: renderOutput };
}(window));
