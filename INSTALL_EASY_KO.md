# ClickGuide Local 쉬운 설치 안내

이 문서는 GitHub Release 등으로 전달받은 압축 패키지를 설치할 때 사용하는 안내입니다.

## 선택해야 하는 폴더

Chrome에서 반드시 아래 폴더를 선택하세요.

```text
LOAD_THIS_FOLDER_ClickGuideLocal
```

이 폴더 안에 `manifest.json`이 바로 보여야 정상입니다.

## 설치 순서

1. 전달받은 `ClickGuideLocal_team_package_*.zip` 파일의 압축을 풉니다.
2. Chrome 주소창에 `chrome://extensions`를 입력합니다.
3. 오른쪽 위 `개발자 모드`를 켭니다.
4. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
5. `LOAD_THIS_FOLDER_ClickGuideLocal` 폴더를 선택합니다.
6. 퍼즐 아이콘에서 `ClickGuide Local`을 고정합니다.

## 사용 방법

1. 문서화할 웹사이트를 엽니다.
2. `ClickGuide Local` 아이콘을 누릅니다.
3. `녹화 시작`을 누릅니다.
4. 필요한 클릭을 수행합니다.
5. `녹화 종료`를 누릅니다.
6. 편집 화면에서 제목, 설명, 순서, 마커 위치를 확인합니다.
7. `PDF 저장`을 눌러 가이드를 저장합니다.

## 자주 나는 오류

### 매니페스트 파일이 없거나 읽을 수 없습니다

잘못된 폴더를 선택한 것입니다.

선택하면 안 되는 것:

```text
ClickGuideLocal_team_package_*
ClickGuideLocal-extension-*.zip
assets
```

선택해야 하는 것:

```text
LOAD_THIS_FOLDER_ClickGuideLocal
```

## 업데이트 방법

기존 확장 폴더를 새 `LOAD_THIS_FOLDER_ClickGuideLocal` 폴더로 교체한 뒤, `chrome://extensions`에서 `ClickGuide Local` 카드의 새로고침 버튼을 누르세요.
