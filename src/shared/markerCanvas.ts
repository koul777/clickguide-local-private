import type { GuideStep } from "./types";

export type MarkerPoint = {
  x: number;
  y: number;
};

export function getMarkerPoint(step: GuideStep): MarkerPoint {
  return {
    x: step.markerX ?? step.x,
    y: step.markerY ?? step.y
  };
}

export function drawMarkerOnContext(
  context: CanvasRenderingContext2D,
  step: GuideStep,
  canvasWidth: number,
  canvasHeight: number,
  label = String(step.orderIndex + 1)
): void {
  const marker = getMarkerPoint(step);
  const scaleX = canvasWidth / Math.max(step.viewportWidth, 1);
  const scaleY = canvasHeight / Math.max(step.viewportHeight, 1);
  const scale = Math.max((scaleX + scaleY) / 2, 1);
  const x = marker.x * scaleX;
  const y = marker.y * scaleY;
  const radius = 24 * scale;
  const badgeRadius = 16 * scale;
  const badgeOffset = 32 * scale;
  const lineWidth = 4 * scale;

  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";

  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 8 * scale;
  context.shadowOffsetY = 3 * scale;

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.strokeStyle = "#ef4444";
  context.lineWidth = lineWidth;
  context.stroke();

  context.shadowBlur = 4 * scale;
  context.beginPath();
  context.arc(x - badgeOffset, y - badgeOffset, badgeRadius, 0, Math.PI * 2);
  context.fillStyle = "#ef4444";
  context.fill();

  context.shadowColor = "transparent";
  context.fillStyle = "#ffffff";
  context.font = `700 ${Math.max(13 * scale, 13)}px system-ui, -apple-system, Segoe UI, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x - badgeOffset, y - badgeOffset + 0.5 * scale);

  context.restore();
}

export function canvasPointToStepPoint(
  step: GuideStep,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): MarkerPoint {
  const rect = canvas.getBoundingClientRect();
  const canvasX = ((clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width;
  const canvasY = ((clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height;

  return {
    x: Math.max(
      0,
      Math.min(step.viewportWidth, Math.round((canvasX / Math.max(canvas.width, 1)) * step.viewportWidth))
    ),
    y: Math.max(
      0,
      Math.min(
        step.viewportHeight,
        Math.round((canvasY / Math.max(canvas.height, 1)) * step.viewportHeight)
      )
    )
  };
}

export function isClientPointNearMarker(
  step: GuideStep,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): boolean {
  const rect = canvas.getBoundingClientRect();
  const marker = getMarkerPoint(step);
  const markerX = (marker.x / Math.max(step.viewportWidth, 1)) * rect.width;
  const markerY = (marker.y / Math.max(step.viewportHeight, 1)) * rect.height;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const distance = Math.hypot(localX - markerX, localY - markerY);
  return distance <= 36;
}

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot load screenshot image"));
    };
    image.src = url;
  });
}

export async function renderAnnotatedImageDataUrl(
  step: GuideStep,
  screenshotBlob: Blob
): Promise<string> {
  const image = await loadImageFromBlob(screenshotBlob);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawMarkerOnContext(context, step, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
