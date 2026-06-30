# ClickGuide Local 설치 안내

이 문서는 소스 코드에서 직접 빌드해 Chrome에 설치하는 방법을 설명합니다.

## 준비물

- Node.js 20 이상
- npm 10 이상
- Chrome 또는 Chromium 기반 브라우저

## 빌드

```powershell
npm.cmd install
npm.cmd run build
```

빌드가 끝나면 `dist` 폴더가 생성됩니다.

## Chrome에 설치

1. Chrome 주소창에 `chrome://extensions`를 입력합니다.
2. 오른쪽 위 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
4. 이 프로젝트의 `dist` 폴더를 선택합니다.
5. 퍼즐 아이콘에서 `ClickGuide Local`을 고정합니다.

## 사용 방법

1. 문서화할 업무 사이트를 엽니다.
2. `ClickGuide Local` 아이콘을 누릅니다.
3. `녹화 시작`을 누릅니다.
4. 평소처럼 웹페이지를 클릭합니다.
5. 필요하면 `일시정지`와 `다시 시작`을 사용합니다.
6. 끝나면 `녹화 종료`를 누릅니다.
7. 자동으로 열리는 편집 화면에서 제목, 설명, 순서, 마커 위치를 수정합니다.
8. `PDF 저장`을 눌러 가이드를 저장합니다.

## 업데이트 방법

1. 최신 소스를 받은 뒤 `npm.cmd run build`를 다시 실행합니다.
2. `chrome://extensions`에서 `ClickGuide Local` 카드의 새로고침 버튼을 누릅니다.

## 주의

- 녹화 중에는 클릭한 페이지의 URL, 제목, 화면 스크린샷, 클릭 위치가 로컬 IndexedDB에 저장됩니다.
- 비밀번호 입력란과 `data-clickguide-ignore`가 붙은 요소는 클릭 기록에서 제외됩니다.
- 민감한 화면은 의도적으로 문서화할 때만 녹화하세요.
- 정식 배포가 필요하면 GitHub Releases 또는 Chrome Web Store 배포를 사용하세요.
