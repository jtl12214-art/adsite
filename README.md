# adsite

## 공통 컴포넌트

루트 HTML 페이지는 `component/header.html`과 `component/footer.html`을 공통으로 사용하며, `assets/js/header.js`가 두 영역을 불러옵니다. 브라우저의 `file://` 접근 제한으로 인해 페이지는 로컬 웹 서버 또는 배포된 웹 서버에서 열어야 합니다.