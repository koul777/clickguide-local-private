import { drawMarkerOnContext, loadImageFromBlob } from "./markerCanvas";
import { getDefaultInstruction, getStepTitle } from "./stepText";
import type { CaptureSession, GuideStep, ScreenshotAsset } from "./types";

type PdfPageImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type SourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const PDF_WIDTH_PT = 841.89;
const PDF_HEIGHT_PT = 595.28;
const PAGE_WIDTH = 1754;
const PAGE_HEIGHT = 1240;
const MARGIN = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT_COLOR = "#172026";
const MUTED_COLOR = "#52605a";
const LINE_COLOR = "#d8ded8";
const PANEL_COLOR = "#f7f8f5";
const FONT_FAMILY =
  '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Inter, system-ui, sans-serif';
const INSTRUCTION_FONT = `400 25px ${FONT_FAMILY}`;
const INSTRUCTION_LINE_HEIGHT = 39;

function safeFileName(value: string): string {
  const withoutDefaultTimestamp = value.replace(/^ClickGuide\s+\d{4}\..*$/i, "ClickGuide");
  const cleaned = withoutDefaultTimestamp
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return cleaned || "clickguide";
}

export function makePdfFileName(title: string): string {
  return `${safeFileName(title)}.pdf`;
}

function createPageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  return canvas;
}

function fillPage(context: CanvasRenderingContext2D): void {
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
}

function ellipsize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  const suffix = "...";
  let output = text;
  while (output.length > 0 && context.measureText(`${output}${suffix}`).width > maxWidth) {
    output = output.slice(0, -1);
  }
  return `${output}${suffix}`;
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const wrapped: string[] = [];

  for (const sourceLine of normalized.split("\n")) {
    if (!sourceLine) {
      wrapped.push("");
      continue;
    }

    let line = "";
    for (const char of Array.from(sourceLine)) {
      const next = `${line}${char}`;
      if (line && context.measureText(next).width > maxWidth) {
        wrapped.push(line);
        line = char.trimStart();
      } else {
        line = next;
      }
    }
    wrapped.push(line);
  }

  return wrapped;
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
): void {
  for (const line of lines) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
}

function drawHeader(
  context: CanvasRenderingContext2D,
  step: GuideStep,
  totalSteps: number,
  continuation: boolean
): number {
  fillPage(context);

  context.fillStyle = TEXT_COLOR;
  context.font = `700 31px ${FONT_FAMILY}`;
  context.textBaseline = "top";
  const title = getStepTitle(step);
  const progress = continuation
    ? `${step.orderIndex + 1} / ${totalSteps} 계속`
    : `${step.orderIndex + 1} / ${totalSteps}`;
  context.fillText(ellipsize(context, title, CONTENT_WIDTH - 190), MARGIN, 54);

  context.fillStyle = MUTED_COLOR;
  context.font = `400 22px ${FONT_FAMILY}`;
  context.textAlign = "right";
  context.fillText(progress, PAGE_WIDTH - MARGIN, 61);
  context.textAlign = "left";

  context.strokeStyle = LINE_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(MARGIN, 111);
  context.lineTo(PAGE_WIDTH - MARGIN, 111);
  context.stroke();

  return 144;
}

function drawMissingScreenshot(
  context: CanvasRenderingContext2D,
  y: number,
  maxHeight: number
): number {
  const height = Math.max(260, Math.min(620, maxHeight));

  context.fillStyle = PANEL_COLOR;
  context.fillRect(MARGIN, y, CONTENT_WIDTH, height);
  context.strokeStyle = LINE_COLOR;
  context.lineWidth = 2;
  context.strokeRect(MARGIN, y, CONTENT_WIDTH, height);

  context.fillStyle = MUTED_COLOR;
  context.font = `400 24px ${FONT_FAMILY}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("스크린샷을 찾을 수 없습니다.", PAGE_WIDTH / 2, y + height / 2);
  context.textAlign = "left";
  context.textBaseline = "top";

  return height;
}

function getStepCropSourceRect(image: HTMLImageElement, step: GuideStep): SourceRect {
  if (
    step.cropX === undefined ||
    step.cropY === undefined ||
    step.cropWidth === undefined ||
    step.cropHeight === undefined ||
    step.cropWidth <= 0 ||
    step.cropHeight <= 0
  ) {
    return {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  }

  const scaleX = image.naturalWidth / Math.max(step.viewportWidth, 1);
  const scaleY = image.naturalHeight / Math.max(step.viewportHeight, 1);
  const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(step.cropX * scaleX)));
  const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(step.cropY * scaleY)));
  const right = Math.max(
    x + 1,
    Math.min(image.naturalWidth, Math.round((step.cropX + step.cropWidth) * scaleX))
  );
  const bottom = Math.max(
    y + 1,
    Math.min(image.naturalHeight, Math.round((step.cropY + step.cropHeight) * scaleY))
  );

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

function getMarkerStepForCrop(step: GuideStep): GuideStep {
  if (
    step.cropX === undefined ||
    step.cropY === undefined ||
    step.cropWidth === undefined ||
    step.cropHeight === undefined ||
    step.cropWidth <= 0 ||
    step.cropHeight <= 0
  ) {
    return step;
  }

  return {
    ...step,
    x: step.x - step.cropX,
    y: step.y - step.cropY,
    markerX: (step.markerX ?? step.x) - step.cropX,
    markerY: (step.markerY ?? step.y) - step.cropY,
    viewportWidth: step.cropWidth,
    viewportHeight: step.cropHeight
  };
}

function shouldDrawMarker(step: GuideStep): boolean {
  if (
    step.cropX === undefined ||
    step.cropY === undefined ||
    step.cropWidth === undefined ||
    step.cropHeight === undefined ||
    step.cropWidth <= 0 ||
    step.cropHeight <= 0
  ) {
    return true;
  }

  const markerX = step.markerX ?? step.x;
  const markerY = step.markerY ?? step.y;
  return (
    markerX >= step.cropX &&
    markerX <= step.cropX + step.cropWidth &&
    markerY >= step.cropY &&
    markerY <= step.cropY + step.cropHeight
  );
}

function drawScreenshot(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  step: GuideStep,
  y: number,
  maxHeight: number
): number {
  const source = getStepCropSourceRect(image, step);
  const hasCrop = source.width !== image.naturalWidth || source.height !== image.naturalHeight;
  const frameHeight = hasCrop ? maxHeight : undefined;
  const scale = Math.min(CONTENT_WIDTH / source.width, maxHeight / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const frameY = y;
  const frameX = MARGIN;
  const frameWidth = CONTENT_WIDTH;
  const actualFrameHeight = frameHeight ?? height;
  const x = Math.round(frameX + (frameWidth - width) / 2);
  const imageY = Math.round(frameY + (actualFrameHeight - height) / 2);
  const markerStep = getMarkerStepForCrop(step);

  context.fillStyle = "#ffffff";
  context.fillRect(frameX, frameY, frameWidth, actualFrameHeight);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    x,
    imageY,
    width,
    height
  );
  if (shouldDrawMarker(step)) {
    context.save();
    context.beginPath();
    context.rect(x, imageY, width, height);
    context.clip();
    context.translate(x, imageY);
    drawMarkerOnContext(context, markerStep, width, height);
    context.restore();
  }

  context.strokeStyle = LINE_COLOR;
  context.lineWidth = 2;
  context.strokeRect(frameX, frameY, frameWidth, actualFrameHeight);

  return actualFrameHeight;
}

async function canvasToJpegPage(canvas: HTMLCanvasElement): Promise<PdfPageImage> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) {
          reject(new Error("PDF 페이지 이미지를 만들지 못했습니다."));
          return;
        }
        resolve(value);
      },
      "image/jpeg",
      0.9
    );
  });

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height
  };
}

async function renderStepPages(
  session: CaptureSession,
  step: GuideStep,
  totalSteps: number,
  screenshot: ScreenshotAsset | undefined
): Promise<PdfPageImage[]> {
  const pages: PdfPageImage[] = [];
  const instruction = step.note.trim() || getDefaultInstruction(step);
  const image = screenshot ? await loadImageFromBlob(screenshot.blob) : undefined;

  const measureCanvas = createPageCanvas();
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) {
    throw new Error("Canvas is unavailable");
  }
  measureContext.font = INSTRUCTION_FONT;
  const allLines = wrapText(measureContext, instruction, CONTENT_WIDTH);
  let remainingLines = allLines;

  const canvas = createPageCanvas();
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  let y = drawHeader(context, step, totalSteps, false);
  const contentBottom = PAGE_HEIGHT - MARGIN;
  const desiredTextLines = Math.min(Math.max(remainingLines.length, 3), 10);
  const desiredTextHeight = desiredTextLines * INSTRUCTION_LINE_HEIGHT + 24;
  const imageMaxHeight = Math.max(520, contentBottom - y - desiredTextHeight);

  const drawnImageHeight = image
    ? drawScreenshot(context, image, step, y, imageMaxHeight)
    : drawMissingScreenshot(context, y, imageMaxHeight);
  y += drawnImageHeight + 30;

  context.fillStyle = TEXT_COLOR;
  context.font = INSTRUCTION_FONT;
  context.textBaseline = "top";
  const firstPageLineCount = Math.max(0, Math.floor((contentBottom - y) / INSTRUCTION_LINE_HEIGHT));
  const firstPageLines = remainingLines.slice(0, firstPageLineCount);
  remainingLines = remainingLines.slice(firstPageLineCount);
  drawLines(context, firstPageLines, MARGIN, y, INSTRUCTION_LINE_HEIGHT);
  pages.push(await canvasToJpegPage(canvas));

  while (remainingLines.length > 0) {
    const continuationCanvas = createPageCanvas();
    const continuationContext = continuationCanvas.getContext("2d");
    if (!continuationContext) {
      throw new Error("Canvas is unavailable");
    }

    y = drawHeader(continuationContext, step, totalSteps, true);
    continuationContext.fillStyle = TEXT_COLOR;
    continuationContext.font = INSTRUCTION_FONT;
    continuationContext.textBaseline = "top";
    const lineCount = Math.floor((contentBottom - y) / INSTRUCTION_LINE_HEIGHT);
    const pageLines = remainingLines.slice(0, lineCount);
    remainingLines = remainingLines.slice(lineCount);
    drawLines(continuationContext, pageLines, MARGIN, y, INSTRUCTION_LINE_HEIGHT);
    pages.push(await canvasToJpegPage(continuationCanvas));
  }

  return pages;
}

function encodeAscii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function buildPdf(pageImages: PdfPageImage[]): Blob {
  const chunks: BlobPart[] = [];
  const offsets: number[] = [0];
  let position = 0;

  const append = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? encodeAscii(chunk) : chunk;
    chunks.push(toArrayBuffer(bytes));
    position += bytes.length;
  };

  const addObject = (id: number, parts: Array<string | Uint8Array>) => {
    offsets[id] = position;
    append(`${id} 0 obj\n`);
    for (const part of parts) {
      append(part);
    }
    append("\nendobj\n");
  };

  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  const pageObjectIds = pageImages.map((_, index) => 3 + index * 3);
  const objectCount = 2 + pageImages.length * 3;
  addObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  addObject(2, [
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${
      pageImages.length
    } >>`
  ]);

  pageImages.forEach((page, index) => {
    const pageId = 3 + index * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const imageName = `Im${index + 1}`;
    const content = `q\n${PDF_WIDTH_PT} 0 0 ${PDF_HEIGHT_PT} 0 0 cm\n/${imageName} Do\nQ\n`;

    addObject(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH_PT} ${PDF_HEIGHT_PT}] /Resources << /XObject << /${imageName} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    ]);
    addObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      "\nendstream"
    ]);
    addObject(contentId, [`<< /Length ${encodeAscii(content).length} >>\nstream\n${content}endstream`]);
  });

  const xrefOffset = position;
  append(`xref\n0 ${objectCount + 1}\n`);
  append("0000000000 65535 f \n");
  for (let id = 1; id <= objectCount; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`);
  append(`startxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: "application/pdf" });
}

export async function generateGuidePdfBlob(
  session: CaptureSession,
  steps: GuideStep[],
  screenshotsByStepId: Map<string, ScreenshotAsset>
): Promise<Blob> {
  const pageImages: PdfPageImage[] = [];

  for (const step of steps) {
    const stepPages = await renderStepPages(
      session,
      step,
      steps.length,
      screenshotsByStepId.get(step.id)
    );
    pageImages.push(...stepPages);
  }

  return buildPdf(pageImages);
}
