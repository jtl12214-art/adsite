import { encode as encodeWebP } from './jsquash/index.js';

export async function encodeWebPImageData(imageData, quality = 92) {
  try {
    const encoded = await encodeWebP(imageData, { quality });
    if (!encoded || encoded.byteLength === 0) {
      throw new Error('인코더가 빈 결과를 반환했습니다.');
    }
    return new Blob([encoded], { type: 'image/webp' });
  } catch (error) {
    throw new Error(`Safari용 WEBP WASM 인코더를 불러오거나 실행하지 못했습니다: ${error.message || error}`);
  }
}
