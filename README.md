# ClickGuide Local

ClickGuide Local is a local Chrome Extension MVP that records browser clicks, captures screenshots, and turns the sequence into a visual step-by-step guide.

## What It Does

- Records click coordinates, URL, page title, viewport size, and target text.
- Captures a screenshot at each click.
- Shows a numbered red marker on the clicked point.
- Lets users edit notes, delete steps, reorder steps, and save the guide as a PDF.
- Stores data locally in IndexedDB.

No AI, LLM, RAG, GPT API, login, or external server is used.

## Install For Team Testing

Use the included team package:

```text
ClickGuideLocal_team_package.zip
```

The package contains:

- `ClickGuideLocal-extension.zip`
- `ClickGuideLocal_팀설치_실행가이드.pptx`
- `INSTALL_KO.md`

## Build

```powershell
npm.cmd install
npm.cmd run build
```

Load the generated `dist` folder in Chrome:

```text
chrome://extensions -> Developer mode -> Load unpacked
```

## Source Layout

```text
src/background/service-worker.ts
src/content/recorder.ts
src/popup/main.tsx
src/editor/main.tsx
src/shared/
```
