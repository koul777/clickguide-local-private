# ClickGuide Local

ClickGuide Local은 브라우저에서 사용자가 클릭한 흐름을 기록하고, 각 클릭 시점의 스크린샷을 함께 저장한 뒤, 단계별 PDF 가이드로 내보내는 Chrome 확장 프로그램입니다.

서버 없이 브라우저 안에서 동작하도록 만든 도구입니다. 녹화 데이터, 스크린샷, 편집한 설명, 내보낸 가이드는 사용자의 PC에 로컬로 보관됩니다.

## 주요 기능

- 확장 프로그램 팝업에서 녹화 시작, 일시정지, 다시 시작, 종료를 제어합니다.
- 클릭이 기록될 때마다 현재 보이는 탭 화면을 스크린샷으로 저장합니다.
- 클릭 좌표, 페이지 제목, 페이지 URL, 화면 크기, 클릭 대상 텍스트, 스크린샷을 IndexedDB에 저장합니다.
- 비밀번호 입력란과 `data-clickguide-ignore`가 지정된 요소는 클릭 기록에서 제외합니다.
- Chrome 확장 권한이 허용하는 범위에서 iframe 내부 클릭도 기록합니다.
- 녹화를 종료하면 자동으로 가이드 편집 화면을 엽니다.
- 가이드 제목, 단계 제목, 단계 설명을 수정할 수 있습니다.
- 단계를 삭제하거나 위아래로 이동할 수 있고, 빨간 마커 위치를 드래그로 보정할 수 있습니다.
- 최종 가이드를 가로형 PDF 파일로 저장합니다.

## 사용하지 않는 것

- AI, LLM, RAG, GPT API를 사용하지 않습니다.
- 계정, 로그인 기능이 없습니다.
- 외부 애플리케이션 서버를 사용하지 않습니다.
- 클라우드 동기화 기능이 없습니다.

## 개인정보와 권한

ClickGuide Local은 사용자가 직접 녹화를 시작한 동안 여러 웹사이트의 업무 흐름을 기록하기 위해 넓은 브라우저 권한이 필요합니다.

Chrome 권한:

- `activeTab`: 현재 활성 탭을 확인하고 작업합니다.
- `scripting`: 녹화가 활성화된 탭에 recorder 스크립트를 주입합니다.
- `tabs`: 가이드 편집 화면을 열고 탭 메타데이터를 확인합니다.
- `storage`: 확장 프로그램의 런타임 상태 저장에 사용합니다.
- `<all_urls>` host 권한: 일반 웹페이지와 iframe에서 녹화할 수 있게 합니다.

캡처된 데이터는 확장 프로그램의 IndexedDB에 로컬로 저장됩니다. 이 확장 프로그램은 캡처한 데이터를 원격 서비스로 전송하지 않습니다. 다만 PDF 가이드에는 스크린샷과 URL이 포함될 수 있으므로, 민감한 페이지는 의도적으로 문서화할 때만 녹화하세요.

## 요구 사항

- Node.js 20 이상
- npm 10 이상
- Manifest V3 확장 프로그램을 지원하는 Chrome 또는 Chromium 기반 브라우저

## 소스에서 설치하기

```powershell
npm.cmd install
npm.cmd run build
```

빌드 후 생성된 확장 프로그램을 Chrome에 로드합니다.

1. `chrome://extensions`를 엽니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 클릭합니다.
4. 생성된 `dist` 폴더를 선택합니다.
5. Chrome 확장 프로그램 메뉴에서 `ClickGuide Local`을 고정합니다.

macOS 또는 Linux에서는 `npm.cmd` 대신 `npm`을 사용하세요.

```bash
npm install
npm run build
```

## 사용 방법

1. 문서화할 웹사이트 또는 웹 애플리케이션을 엽니다.
2. `ClickGuide Local` 확장 프로그램 아이콘을 클릭합니다.
3. `녹화 시작`을 클릭합니다.
4. 평소처럼 업무 흐름을 수행합니다.
5. 필요하면 `일시정지` 또는 `다시 시작`을 사용합니다.
6. `녹화 종료`를 클릭합니다.
7. 편집 화면에서 제목, 설명, 단계 순서, 마커 위치를 확인하고 수정합니다.
8. `PDF 저장`을 클릭해 가이드를 저장합니다.

## 개발

Vite 개발 서버 실행:

```powershell
npm.cmd run dev
```

프로덕션 빌드:

```powershell
npm.cmd run build
```

빌드된 앱 shell 미리보기:

```powershell
npm.cmd run preview
```

확장 프로그램으로 테스트할 때는 `npm.cmd run build`를 실행한 뒤 `chrome://extensions`에서 압축해제된 `dist` 폴더를 다시 로드하세요.

## 저장소 구조

```text
public/manifest.json              Chrome 확장 프로그램 매니페스트
src/background/service-worker.ts   백그라운드 워커와 스크린샷 캡처 처리
src/content/recorder.ts            신뢰된 클릭 이벤트를 기록하는 content script
src/popup/main.tsx                 녹화 제어 팝업 UI
src/editor/main.tsx                가이드 편집 UI
src/shared/db.ts                   IndexedDB 저장소 처리
src/shared/exportPdf.ts            PDF 생성
src/shared/markerCanvas.ts         스크린샷 마커 그리기 헬퍼
src/shared/stepText.ts             단계 제목과 기본 안내 문구 헬퍼
scripts/make_clickguide_ppt.py     선택 사항: 설치 안내 슬라이드 생성 스크립트
```

## 릴리스 산출물

`dist/`, `release/`, `*.zip`, `*.pptx` 같은 생성 파일은 Git에 커밋하지 않습니다. 필요한 경우 로컬에서 빌드하거나 GitHub Releases에 첨부하세요.

## 제한 사항

- `chrome://`, `edge://`, `about:`, `devtools://`, 확장 프로그램 페이지처럼 브라우저가 제한하는 페이지는 녹화할 수 없습니다.
- 스크린샷 캡처는 현재 보이는 탭 영역만 저장하며, 전체 페이지 스크롤 높이를 자동으로 캡처하지는 않습니다.
- 확장 content script를 차단하는 사이트나 격리된 cross-origin iframe에서는 일부 클릭이 기록되지 않을 수 있습니다.
- 공개 저장소로 사용할 수 있도록 소스와 문서를 정리했지만, 저장소 공개 여부 변경은 GitHub 저장소 설정에서 관리됩니다.

## 라이선스

MIT
