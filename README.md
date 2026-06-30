# ClickGuide Local

ClickGuide Local is a Chrome Extension that records browser clicks, captures screenshots, and turns the captured flow into a local step-by-step PDF guide.

The project is designed for documenting browser-based workflows without a server. Recording data, screenshots, edited notes, and exported guides stay on the user's machine.

## Features

- Start, pause, resume, and stop click recording from the extension popup.
- Capture the visible tab screenshot for each recorded click.
- Store click coordinates, page title, page URL, viewport size, target text, and screenshot data in IndexedDB.
- Skip password fields and elements marked with `data-clickguide-ignore`.
- Detect clicks in iframes where Chrome extension permissions allow content script injection.
- Open an editor after recording stops.
- Edit the guide title, each step title, and each step description.
- Delete steps, move steps up or down, and drag the red marker to correct its position.
- Save the final guide as a landscape PDF.

## What This Project Does Not Use

- No AI, LLM, RAG, or GPT API.
- No account system or login.
- No external application server.
- No cloud sync.

## Privacy And Permissions

ClickGuide Local needs broad browser permissions because it records workflows across arbitrary websites during a user-controlled recording session.

Chrome permissions:

- `activeTab`: identify and work with the active tab.
- `scripting`: inject the recorder script when recording is active.
- `tabs`: open the guide editor and inspect tab metadata.
- `storage`: Chrome extension storage access for runtime state.
- `<all_urls>` host permissions: allow recording on ordinary web pages and iframes.

Captured data is saved locally in the extension's IndexedDB database. The extension does not send captured data to a remote service. Users should still avoid recording sensitive pages unless they intend to include those screenshots and URLs in the exported guide.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Chrome or a Chromium-based browser that supports Manifest V3 extensions.

## Install From Source

```powershell
npm.cmd install
npm.cmd run build
```

Then load the generated extension:

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the generated `dist` folder.
5. Pin `ClickGuide Local` from the Chrome extensions menu.

On macOS or Linux, use `npm install` and `npm run build` instead of `npm.cmd`.

## Usage

1. Open the website or web application you want to document.
2. Click the `ClickGuide Local` extension icon.
3. Click `녹화 시작`.
4. Perform the workflow normally.
5. Use `일시정지` or `다시 시작` when needed.
6. Click `녹화 종료`.
7. Edit titles, descriptions, step order, and marker positions in the editor.
8. Click `PDF 저장` to save the guide.

## Development

Run the Vite dev server:

```powershell
npm.cmd run dev
```

Build production assets:

```powershell
npm.cmd run build
```

Preview the built app shell:

```powershell
npm.cmd run preview
```

For extension testing, use `npm.cmd run build` and reload the unpacked `dist` folder in `chrome://extensions`.

## Repository Layout

```text
public/manifest.json              Chrome extension manifest
src/background/service-worker.ts   Extension background worker and screenshot capture
src/content/recorder.ts            Content script that records trusted click events
src/popup/main.tsx                 Popup UI for recording controls
src/editor/main.tsx                Guide editor UI
src/shared/db.ts                   IndexedDB persistence
src/shared/exportPdf.ts            PDF generation
src/shared/markerCanvas.ts         Screenshot marker drawing helpers
src/shared/stepText.ts             Step title and instruction helpers
scripts/make_clickguide_ppt.py     Optional installer-slide generation script
```

## Release Artifacts

Generated packages such as `dist/`, `release/`, `*.zip`, and `*.pptx` are intentionally ignored by Git. Build them locally or attach them to GitHub Releases instead of committing them to the source tree.

## Limitations

- Browser-restricted pages such as `chrome://`, `edge://`, `about:`, `devtools://`, and extension pages cannot be recorded.
- Screenshot capture records the visible tab area, not the full page scroll height.
- Sites that block extension content scripts or use isolated cross-origin frames may not expose every click.
- This repository is source-ready for public GitHub visibility, but changing the GitHub repository visibility must still be done in GitHub settings.

## License

MIT
