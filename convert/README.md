# PixConvert

PixConvert는 브라우저에서 JPG, PNG, WEBP 이미지를 변환하는 정적 웹 애플리케이션입니다.

## 실행 방법

1. VS Code에서 이 폴더를 열고 Live Server를 실행합니다.
2. index.html을 브라우저에서 열어 사용합니다.

## 사용 라이브러리

- jsZip 3.10.1 (`assets/vendor/jszip.min.js`): ZIP 다운로드 기능 (로컬 로딩)
- @jsquash/webp 1.5.0: Safari / iOS Safari용 WEBP 인코딩 지원

## WEBP Safari 호환성

기본 Canvas `toBlob('image/webp')`가 지원되지 않는 브라우저에서는 `@jsquash/webp`의 WebAssembly 인코더를 사용합니다. 이를 통해 브라우저 기능 기반으로 WEBP 파일을 생성하고, 변환 결과의 파일 형식을 직접 검증합니다.
