import { renderAnnotatedImageDataUrl } from "./markerCanvas";
import { getDefaultInstruction, getStepTitle } from "./stepText";
import type { CaptureSession, GuideStep, ScreenshotAsset } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function generateGuideHtml(
  session: CaptureSession,
  steps: GuideStep[],
  screenshotsByStepId: Map<string, ScreenshotAsset>
): Promise<string> {
  const renderedSteps = await Promise.all(
    steps.map(async (step) => {
      const screenshot = screenshotsByStepId.get(step.id);
      if (!screenshot) {
        return {
          step,
          imageDataUrl: "",
          instruction: step.note.trim() || getDefaultInstruction(step)
        };
      }

      return {
        step,
        imageDataUrl: await renderAnnotatedImageDataUrl(step, screenshot.blob),
        instruction: step.note.trim() || getDefaultInstruction(step)
      };
    })
  );

  const sections = renderedSteps
    .map(({ step, imageDataUrl, instruction }) => {
      const title = getStepTitle(step);
      const image = imageDataUrl
        ? `<img src="${imageDataUrl}" alt="${escapeHtml(title)}" />`
        : `<div class="missing">스크린샷을 찾을 수 없습니다.</div>`;

      return `<section class="step">
  <div class="step-header">
    <h2>${escapeHtml(title)}</h2>
    <span>${step.orderIndex + 1} / ${steps.length}</span>
  </div>
  ${image}
  <p class="instruction">${escapeHtml(instruction)}</p>
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(session.title)}</title>
  <style>
    :root {
      color: #172026;
      background: #f7f8f5;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 56px; }
    header { margin-bottom: 24px; border-bottom: 1px solid #d8ded8; padding-bottom: 18px; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
    .summary { margin: 0; color: #52605a; }
    .step { margin: 28px 0 38px; break-inside: avoid; }
    .step-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .step-header h2 { margin: 0; font-size: 18px; line-height: 1.35; }
    .step-header span { color: #52605a; font-size: 13px; white-space: nowrap; }
    img { display: block; width: 100%; height: auto; border: 1px solid #d8ded8; border-radius: 8px; background: #fff; }
    .instruction { margin: 12px 0 0; font-size: 16px; line-height: 1.6; white-space: pre-wrap; }
    .missing { padding: 32px; border: 1px solid #d8ded8; border-radius: 8px; background: #fff; color: #6b766f; }
    @media print {
      @page { size: A4 landscape; margin: 12mm; }
      :root { background: #fff; }
      main { max-width: none; padding: 0; }
      .step { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="summary">총 ${steps.length}개 단계 · ClickGuide Local에서 생성됨</p>
    </header>
    ${sections}
  </main>
</body>
</html>`;
}
