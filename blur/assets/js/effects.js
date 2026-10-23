(function (global) {
  "use strict";

  const STRENGTH = {
    weak: { mosaic: 12, blur: 5 },
    medium: { mosaic: 24, blur: 11 },
    strong: { mosaic: 42, blur: 19 }
  };
  const JPEG_MCU_SIZE = 16;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function blurPixels(data, width, height, radius) {
    if (radius < 1 || width < 1 || height < 1) return;
    const source = new Uint8ClampedArray(data);
    const temp = new Uint8ClampedArray(data.length);
    const diameter = radius * 2 + 1;

    for (let y = 0; y < height; y += 1) {
      let sums = [0, 0, 0, 0];
      for (let x = -radius; x <= radius; x += 1) {
        const index = (y * width + clamp(x, 0, width - 1)) * 4;
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += source[index + channel];
      }
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) temp[index + channel] = sums[channel] / diameter;
        const removeIndex = (y * width + clamp(x - radius, 0, width - 1)) * 4;
        const addIndex = (y * width + clamp(x + radius + 1, 0, width - 1)) * 4;
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += source[addIndex + channel] - source[removeIndex + channel];
      }
    }

    for (let x = 0; x < width; x += 1) {
      let sums = [0, 0, 0, 0];
      for (let y = -radius; y <= radius; y += 1) {
        const index = (clamp(y, 0, height - 1) * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += temp[index + channel];
      }
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) data[index + channel] = sums[channel] / diameter;
        const removeIndex = (clamp(y - radius, 0, height - 1) * width + x) * 4;
        const addIndex = (clamp(y + radius + 1, 0, height - 1) * width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += temp[addIndex + channel] - temp[removeIndex + channel];
      }
    }
  }

  function mosaicPixels(data, width, height, blockSize, originX, originY) {
    const size = Math.max(1, Math.round(blockSize));
    const offsetX = Math.round(originX);
    const offsetY = Math.round(originY);
    const startX = Math.floor(offsetX / size) * size - offsetX;
    const startY = Math.floor(offsetY / size) * size - offsetY;
    for (let top = startY; top < height; top += size) {
      for (let left = startX; left < width; left += size) {
        const blockLeft = Math.max(0, left);
        const blockTop = Math.max(0, top);
        const blockRight = Math.min(width, left + size);
        const blockBottom = Math.min(height, top + size);
        if (blockRight <= blockLeft || blockBottom <= blockTop) continue;
        const sums = [0, 0, 0];
        let alphaSum = 0;
        for (let y = blockTop; y < blockBottom; y += 1) {
          for (let x = blockLeft; x < blockRight; x += 1) {
            const index = (y * width + x) * 4;
            const alpha = data[index + 3];
            for (let channel = 0; channel < 3; channel += 1) sums[channel] += data[index + channel] * alpha;
            alphaSum += alpha;
          }
        }
        if (!alphaSum) continue;
        const color = sums.map(function (sum) { return sum / alphaSum; });
        for (let y = blockTop; y < blockBottom; y += 1) {
          for (let x = blockLeft; x < blockRight; x += 1) {
            const index = (y * width + x) * 4;
            if (!data[index + 3]) continue;
            for (let channel = 0; channel < 3; channel += 1) data[index + channel] = color[channel];
          }
        }
      }
    }
  }

  function applyRegion(context, area, mapping) {
    if (!area || area.width < 1 || area.height < 1) return;
    if (area.type === "cover") {
      const scale = Math.max(.01, mapping.sourceScale || 1);
      let left = mapping.x;
      let top = mapping.y;
      let right = mapping.x + mapping.width;
      let bottom = mapping.y + mapping.height;
      if (mapping.format === "jpg") {
        const originX = mapping.originX || 0;
        const originY = mapping.originY || 0;
        const sourceLeft = (left - originX) / scale;
        const sourceTop = (top - originY) / scale;
        const sourceRight = (right - originX) / scale;
        const sourceBottom = (bottom - originY) / scale;
        left = originX + Math.floor(sourceLeft / JPEG_MCU_SIZE) * JPEG_MCU_SIZE * scale;
        top = originY + Math.floor(sourceTop / JPEG_MCU_SIZE) * JPEG_MCU_SIZE * scale;
        right = originX + Math.ceil(sourceRight / JPEG_MCU_SIZE) * JPEG_MCU_SIZE * scale;
        bottom = originY + Math.ceil(sourceBottom / JPEG_MCU_SIZE) * JPEG_MCU_SIZE * scale;
      }
      const coverLeft = clamp(Math.floor(left), 0, context.canvas.width);
      const coverTop = clamp(Math.floor(top), 0, context.canvas.height);
      const coverRight = clamp(Math.ceil(right), 0, context.canvas.width);
      const coverBottom = clamp(Math.ceil(bottom), 0, context.canvas.height);
      if (coverRight <= coverLeft || coverBottom <= coverTop) return;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.fillStyle = area.color || "#000000";
      context.fillRect(coverLeft, coverTop, coverRight - coverLeft, coverBottom - coverTop);
      context.restore();
      return;
    }

    const canvas = context.canvas;
    const left = clamp(Math.floor(mapping.x), 0, canvas.width);
    const top = clamp(Math.floor(mapping.y), 0, canvas.height);
    const right = clamp(Math.ceil(mapping.x + mapping.width), 0, canvas.width);
    const bottom = clamp(Math.ceil(mapping.y + mapping.height), 0, canvas.height);
    if (right <= left || bottom <= top) return;

    const scale = Math.max(.01, mapping.sourceScale);
    if (area.type === "mosaic") {
      const imageData = context.getImageData(left, top, right - left, bottom - top);
      mosaicPixels(imageData.data, imageData.width, imageData.height,
        STRENGTH[area.strength].mosaic * scale,
        left - Math.round(mapping.originX), top - Math.round(mapping.originY));
      context.putImageData(imageData, left, top);
      return;
    }

    if (area.type === "blur") {
      const radius = Math.max(1, Math.round(STRENGTH[area.strength].blur * scale));
      const pad = Math.min(radius * 3, Math.max(canvas.width, canvas.height));
      const paddedLeft = Math.max(0, left - pad);
      const paddedTop = Math.max(0, top - pad);
      const paddedRight = Math.min(canvas.width, right + pad);
      const paddedBottom = Math.min(canvas.height, bottom + pad);
      const imageData = context.getImageData(paddedLeft, paddedTop, paddedRight - paddedLeft, paddedBottom - paddedTop);
      blurPixels(imageData.data, imageData.width, imageData.height, radius);
      const cropX = left - paddedLeft;
      const cropY = top - paddedTop;
      const cropped = context.createImageData(right - left, bottom - top);
      for (let y = 0; y < cropped.height; y += 1) {
        const from = ((cropY + y) * imageData.width + cropX) * 4;
        cropped.data.set(imageData.data.subarray(from, from + cropped.width * 4), y * cropped.width * 4);
      }
      context.putImageData(cropped, left, top);
    }
  }

  function orderedAreas(areas) {
    return areas.filter(function (area) { return area.type !== "cover"; })
      .concat(areas.filter(function (area) { return area.type === "cover"; }));
  }

  global.PixBlurEffects = { applyRegion: applyRegion, orderedAreas: orderedAreas, strengths: STRENGTH };
}(window));
