import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import {
  deleteAllLocalData,
  deleteSession,
  deleteStep,
  getLatestSession,
  getScreenshotsForSteps,
  getSession,
  getSteps,
  moveStep,
  patchStep,
  updateSessionTitle
} from "../shared/db";
import { AI_PROVIDER_OPTIONS, getAiProviderMeta, type AiProvider } from "./aiProviderMeta";
import { generateGuidePdfBlob, makePdfFileName } from "../shared/exportPdf";
import {
  canvasPointToStepPoint,
  drawMarkerOnContext,
  isClientPointNearMarker,
  loadImageFromBlob,
  type MarkerPoint
} from "../shared/markerCanvas";
import { getDefaultInstruction, getStepLabel } from "../shared/stepText";
import type { CaptureSession, GuideStep, ScreenshotAsset } from "../shared/types";

const AI_ENABLED_STORAGE_KEY = "clickguide.aiEnabled";
const ALLOW_EXTERNAL_AI = import.meta.env.VITE_ALLOW_EXTERNAL_AI === "true";
const emptyAiApiKeys: Record<AiProvider, string> = {
  openai: "",
  gemini: "",
  claude: ""
};
const loadAiCopy = ALLOW_EXTERNAL_AI ? () => import("./aiCopy") : undefined;
const AI_SECURITY_CONFIRM_MESSAGE = [
  "AI 문구 작성 기능을 켜면 현재 단계의 스크린샷, 페이지 제목, URL, 클릭 대상 텍스트가 선택한 외부 AI API로 전송될 수 있습니다.",
  "",
  "회사 보안 정책에 위배될 수 있거나 개인정보, 고객정보, 영업비밀, 내부 시스템 정보가 포함된 화면이라면 AI 연결/API 키 입력/문구 작성을 진행하지 마세요.",
  "",
  "보안 정책상 문제가 없는 경우에만 계속하세요."
].join("\n");

type StepCanvasProps = {
  step: GuideStep | undefined;
  screenshot: ScreenshotAsset | undefined;
  editMode: CanvasEditMode;
  onMarkerCommit: (stepId: string, point: MarkerPoint) => void;
  onCropCommit: (stepId: string, rect: CropRect) => void;
};

type CanvasEditMode = "marker" | "crop";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getStepCropRect(step: GuideStep | undefined): CropRect | undefined {
  if (
    !step ||
    step.cropX === undefined ||
    step.cropY === undefined ||
    step.cropWidth === undefined ||
    step.cropHeight === undefined ||
    step.cropWidth <= 0 ||
    step.cropHeight <= 0
  ) {
    return undefined;
  }

  return {
    x: step.cropX,
    y: step.cropY,
    width: step.cropWidth,
    height: step.cropHeight
  };
}

function clampPointToStep(point: MarkerPoint, step: GuideStep): MarkerPoint {
  return {
    x: Math.max(0, Math.min(step.viewportWidth, point.x)),
    y: Math.max(0, Math.min(step.viewportHeight, point.y))
  };
}

function normalizeCropRect(start: MarkerPoint, end: MarkerPoint, step: GuideStep): CropRect {
  const first = clampPointToStep(start, step);
  const second = clampPointToStep(end, step);
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const width = Math.abs(second.x - first.x);
  const height = Math.abs(second.y - first.y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  };
}

function drawCropOverlay(
  context: CanvasRenderingContext2D,
  step: GuideStep,
  canvasWidth: number,
  canvasHeight: number,
  crop: CropRect | undefined
): void {
  if (!crop) {
    return;
  }

  const scaleX = canvasWidth / Math.max(step.viewportWidth, 1);
  const scaleY = canvasHeight / Math.max(step.viewportHeight, 1);
  const x = crop.x * scaleX;
  const y = crop.y * scaleY;
  const width = crop.width * scaleX;
  const height = crop.height * scaleY;

  context.save();
  context.fillStyle = "rgba(15, 23, 42, 0.42)";
  context.beginPath();
  context.rect(0, 0, canvasWidth, canvasHeight);
  context.rect(x, y, width, height);
  context.fill("evenodd");

  context.strokeStyle = "#0f766e";
  context.lineWidth = Math.max(3 * ((scaleX + scaleY) / 2), 3);
  context.setLineDash([12, 8]);
  context.strokeRect(x, y, width, height);

  context.fillStyle = "#0f766e";
  context.font = `700 ${Math.max(16 * ((scaleX + scaleY) / 2), 16)}px system-ui, sans-serif`;
  context.textBaseline = "top";
  context.fillText("PDF 출력 영역", x + 10, y + 10);
  context.restore();
}

function Button({
  children,
  onClick,
  disabled,
  intent = "neutral"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  intent?: "primary" | "neutral" | "danger";
}): React.ReactElement {
  const className = {
    primary: "bg-brand text-white hover:bg-teal-800",
    neutral: "bg-white text-ink ring-1 ring-line hover:bg-panel",
    danger: "bg-white text-danger ring-1 ring-red-200 hover:bg-red-50"
  }[intent];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`focus-ring rounded-md px-3 py-2 text-sm font-semibold transition ${className}`}
    >
      {children}
    </button>
  );
}

function StepCanvas({
  step,
  screenshot,
  editMode,
  onMarkerCommit,
  onCropCommit
}: StepCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const dragModeRef = useRef<CanvasEditMode | undefined>(undefined);
  const draftPointRef = useRef<MarkerPoint | null>(null);
  const cropDragStartRef = useRef<MarkerPoint | null>(null);
  const draftCropRef = useRef<CropRect | null>(null);

  const draw = useCallback(
    (draftStep?: GuideStep, draftCrop?: CropRect) => {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      const activeStep = draftStep ?? step;
      if (!canvas || !image || !activeStep) {
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawMarkerOnContext(context, activeStep, canvas.width, canvas.height);
      drawCropOverlay(
        context,
        activeStep,
        canvas.width,
        canvas.height,
        draftCrop ?? getStepCropRect(activeStep)
      );
    },
    [step]
  );

  useEffect(() => {
    let cancelled = false;
    imageRef.current = null;

    async function load(): Promise<void> {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      if (!step || !screenshot) {
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const image = await loadImageFromBlob(screenshot.blob);
      if (cancelled) {
        return;
      }
      imageRef.current = image;
      draw();
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [draw, screenshot, step]);

  useEffect(() => {
    draw();
  }, [draw, step]);

  const updateDraftMarker = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !step) {
        return;
      }

      const point = canvasPointToStepPoint(step, canvas, clientX, clientY);
      draftPointRef.current = point;
      draw({
        ...step,
        markerX: point.x,
        markerY: point.y
      });
    },
    [draw, step]
  );

  const updateDraftCrop = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const start = cropDragStartRef.current;
      if (!canvas || !step || !start) {
        return;
      }

      const end = canvasPointToStepPoint(step, canvas, clientX, clientY);
      const crop = normalizeCropRect(start, end, step);
      draftCropRef.current = crop;
      draw(step, crop);
    },
    [draw, step]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !step) {
      return;
    }

    if (editMode === "crop") {
      const point = canvasPointToStepPoint(step, canvas, event.clientX, event.clientY);
      cropDragStartRef.current = point;
      draftCropRef.current = {
        x: point.x,
        y: point.y,
        width: 1,
        height: 1
      };
      draggingRef.current = true;
      dragModeRef.current = "crop";
      canvas.setPointerCapture(event.pointerId);
      draw(step, draftCropRef.current);
      return;
    }

    draggingRef.current = true;
    dragModeRef.current = "marker";
    canvas.setPointerCapture(event.pointerId);
    updateDraftMarker(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
      return;
    }
    if (dragModeRef.current === "crop") {
      updateDraftCrop(event.clientX, event.clientY);
      return;
    }
    updateDraftMarker(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !step) {
      return;
    }

    draggingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (dragModeRef.current === "crop") {
      const crop = draftCropRef.current;
      cropDragStartRef.current = null;
      draftCropRef.current = null;
      dragModeRef.current = undefined;
      if (crop && crop.width >= 20 && crop.height >= 20) {
        onCropCommit(step.id, crop);
      } else {
        draw();
      }
      return;
    }

    const point = draftPointRef.current;
    draftPointRef.current = null;
    dragModeRef.current = undefined;
    if (point) {
      onMarkerCommit(step.id, point);
    }
  };

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-slate-100 p-4">
      {step && screenshot ? (
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`max-h-full max-w-full rounded-md border border-line bg-white shadow-tool ${
            editMode === "crop" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
          }`}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-white px-6 py-8 text-center text-sm text-slate-500">
          표시할 스크린샷이 없습니다.
        </div>
      )}
    </div>
  );
}

function getSessionIdFromUrl(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get("sessionId") ?? undefined;
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GuideEditor(): React.ReactElement {
  const [session, setSession] = useState<CaptureSession | undefined>();
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [screenshots, setScreenshots] = useState<Map<string, ScreenshotAsset>>(new Map());
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [aiApiKeys, setAiApiKeys] = useState<Record<AiProvider, string>>(emptyAiApiKeys);
  const [copyStatus, setCopyStatus] = useState("");
  const [copyGenerating, setCopyGenerating] = useState(false);
  const [canvasEditMode, setCanvasEditMode] = useState<CanvasEditMode>("marker");

  const selectedStep = useMemo(
    () => steps.find((step) => step.id === selectedStepId) ?? steps[0],
    [selectedStepId, steps]
  );
  const selectedScreenshot = selectedStep ? screenshots.get(selectedStep.id) : undefined;
  const selectedProviderMeta = getAiProviderMeta(aiProvider);
  const selectedCrop = getStepCropRect(selectedStep);

  const loadGuide = useCallback(async (preferredStepId?: string) => {
    setLoading(true);
    setError("");
    try {
      const sessionId = getSessionIdFromUrl();
      const loadedSession = sessionId ? await getSession(sessionId) : await getLatestSession();
      if (!loadedSession) {
        setSession(undefined);
        setSteps([]);
        setScreenshots(new Map());
        setSelectedStepId(undefined);
        return;
      }

      const loadedSteps = await getSteps(loadedSession.id);
      const loadedScreenshots = await getScreenshotsForSteps(loadedSteps);
      const preferredExists = loadedSteps.some((step) => step.id === preferredStepId);

      setSession(loadedSession);
      setSteps(loadedSteps);
      setScreenshots(loadedScreenshots);
      setSelectedStepId(preferredExists ? preferredStepId : loadedSteps[0]?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "가이드를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuide();
  }, [loadGuide]);

  useEffect(() => {
    if (!ALLOW_EXTERNAL_AI) {
      setAiEnabled(false);
      window.localStorage.removeItem(AI_ENABLED_STORAGE_KEY);
      return;
    }

    const saved = window.localStorage.getItem(AI_ENABLED_STORAGE_KEY);
    setAiEnabled(saved === "true");
  }, []);

  const updateStepLocal = useCallback((stepId: string, patch: Partial<GuideStep>) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
    );
  }, []);

  const handleAiEnabledChange = (enabled: boolean): void => {
    if (!ALLOW_EXTERNAL_AI) {
      setAiEnabled(false);
      window.localStorage.removeItem(AI_ENABLED_STORAGE_KEY);
      return;
    }

    if (enabled) {
      const confirmed = window.confirm(AI_SECURITY_CONFIRM_MESSAGE);
      if (!confirmed) {
        setAiEnabled(false);
        window.localStorage.setItem(AI_ENABLED_STORAGE_KEY, "false");
        setCopyStatus("AI 기능을 켜지 않았습니다.");
        return;
      }
    }

    setAiEnabled(enabled);
    window.localStorage.setItem(AI_ENABLED_STORAGE_KEY, String(enabled));
    setCopyStatus("");
    if (!enabled) {
      setAiApiKeys({ ...emptyAiApiKeys });
    }
  };

  const handleAiApiKeyChange = (provider: AiProvider, value: string): void => {
    setAiApiKeys((current) => ({
      ...current,
      [provider]: value
    }));
  };

  const handleGenerateCopy = async (): Promise<void> => {
    if (!ALLOW_EXTERNAL_AI || !aiEnabled || !loadAiCopy) {
      setError("AI 기능이 꺼져 있습니다.");
      return;
    }

    if (!selectedStep) {
      return;
    }

    const apiKey = aiApiKeys[aiProvider].trim();
    if (!apiKey) {
      setError("AI API 키를 입력하세요.");
      return;
    }

    setCopyGenerating(true);
    setCopyStatus("AI 문구를 작성하는 중입니다.");
    setError("");
    try {
      const { generateStepCopy } = await loadAiCopy();
      const copy = await generateStepCopy({
        provider: aiProvider,
        apiKey,
        step: selectedStep,
        screenshot: selectedScreenshot
      });
      updateStepLocal(selectedStep.id, {
        title: copy.title,
        note: copy.note
      });
      await patchStep(selectedStep.id, {
        title: copy.title,
        note: copy.note
      });
      setCopyStatus("AI 문구를 적용했습니다.");
    } catch (err) {
      setCopyStatus("");
      setError(err instanceof Error ? err.message : "AI 문구 작성에 실패했습니다.");
    } finally {
      setCopyGenerating(false);
    }
  };

  const handleTitleChange = async (value: string): Promise<void> => {
    if (!session) {
      return;
    }
    setSession({ ...session, title: value });
    await updateSessionTitle(session.id, value);
  };

  const handleNoteChange = (value: string): void => {
    if (!selectedStep) {
      return;
    }
    updateStepLocal(selectedStep.id, { note: value });
    void patchStep(selectedStep.id, { note: value });
  };

  const handleStepTitleChange = (value: string): void => {
    if (!selectedStep) {
      return;
    }
    updateStepLocal(selectedStep.id, { title: value });
    void patchStep(selectedStep.id, { title: value });
  };

  const handleDeleteStep = async (stepId: string): Promise<void> => {
    if (!session) {
      return;
    }
    await deleteStep(session.id, stepId);
    await loadGuide(selectedStepId === stepId ? undefined : selectedStepId);
  };

  const handleDeleteCurrentGuide = async (): Promise<void> => {
    if (!session) {
      return;
    }

    const confirmed = window.confirm(
      "현재 가이드와 연결된 단계, 스크린샷을 모두 삭제합니다. 계속할까요?"
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await deleteSession(session.id);
      window.history.replaceState(null, "", window.location.pathname);
      await loadGuide();
    } catch (err) {
      setError(err instanceof Error ? err.message : "현재 가이드를 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllLocalData = async (): Promise<void> => {
    const confirmed = window.confirm(
      "모든 로컬 가이드, 단계, 스크린샷을 삭제합니다. 이 작업은 되돌릴 수 없습니다."
    );
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");
    try {
      await deleteAllLocalData();
      window.history.replaceState(null, "", window.location.pathname);
      setSession(undefined);
      setSteps([]);
      setScreenshots(new Map());
      setSelectedStepId(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로컬 기록을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const handleMoveStep = async (stepId: string, direction: "up" | "down"): Promise<void> => {
    if (!session) {
      return;
    }
    await moveStep(session.id, stepId, direction);
    await loadGuide(stepId);
  };

  const handleMarkerCommit = async (stepId: string, point: MarkerPoint): Promise<void> => {
    updateStepLocal(stepId, { markerX: point.x, markerY: point.y });
    await patchStep(stepId, { markerX: point.x, markerY: point.y });
  };

  const handleCropCommit = async (stepId: string, crop: CropRect): Promise<void> => {
    const patch = {
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height
    };
    updateStepLocal(stepId, patch);
    await patchStep(stepId, patch);
  };

  const handleClearCrop = async (): Promise<void> => {
    if (!selectedStep) {
      return;
    }

    const patch = {
      cropX: undefined,
      cropY: undefined,
      cropWidth: undefined,
      cropHeight: undefined
    };
    updateStepLocal(selectedStep.id, patch);
    await patchStep(selectedStep.id, patch);
  };

  const handleExport = async (): Promise<void> => {
    if (!session) {
      return;
    }

    setExporting(true);
    setError("");
    try {
      const pdf = await generateGuidePdfBlob(session, steps, screenshots);
      downloadBlob(makePdfFileName(session.title), pdf);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF 파일 저장에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-panel p-6 text-sm text-slate-600">
        가이드를 불러오는 중입니다.
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-panel p-6">
        <div className="rounded-lg border border-line bg-white p-8 text-center shadow-tool">
          <h1 className="m-0 text-lg font-bold text-ink">가이드 세션이 없습니다.</h1>
          <p className="mb-0 mt-2 text-sm text-slate-600">
            확장 프로그램 popup에서 녹화를 시작한 뒤 다시 열어주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[720px] flex-col bg-panel text-ink">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 rounded-md bg-brand px-2.5 py-1.5 text-sm font-bold text-white">
            ClickGuide
          </div>
          <input
            value={session.title}
            onChange={(event) => void handleTitleChange(event.target.value)}
            className="focus-ring min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-base font-semibold"
            aria-label="가이드 제목"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-line">
            {steps.length}개 단계
          </span>
          <Button intent="primary" disabled={exporting || steps.length === 0} onClick={handleExport}>
            {exporting ? "PDF 준비 중" : "PDF 저장"}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-white">
          <div className="sticky top-0 z-10 border-b border-line bg-white px-4 py-3">
            <h2 className="m-0 text-sm font-bold">단계 리스트</h2>
          </div>
          <div className="space-y-2 p-3">
            {steps.length === 0 ? (
              <p className="rounded-md border border-dashed border-line p-4 text-sm text-slate-500">
                아직 기록된 단계가 없습니다.
              </p>
            ) : null}
            {steps.map((step, index) => {
              const active = selectedStep?.id === step.id;
              return (
                <div
                  key={step.id}
                  className={`rounded-lg border p-3 transition ${
                    active
                      ? "border-brand bg-teal-50"
                      : "border-line bg-white hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedStepId(step.id)}
                    className="focus-ring w-full rounded text-left"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold">{getStepLabel(step)}</p>
                        <p className="m-0 mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {step.note.trim() || getDefaultInstruction(step)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <Button
                      disabled={index === 0}
                      onClick={() => void handleMoveStep(step.id, "up")}
                    >
                      위
                    </Button>
                    <Button
                      disabled={index === steps.length - 1}
                      onClick={() => void handleMoveStep(step.id, "down")}
                    >
                      아래
                    </Button>
                    <Button intent="danger" onClick={() => void handleDeleteStep(step.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-white px-4">
            <h2 className="m-0 text-sm font-bold">
              {selectedStep ? `${selectedStep.orderIndex + 1}단계 미리보기` : "미리보기"}
            </h2>
            <p className="m-0 text-xs text-slate-500">마커를 드래그해서 위치를 보정할 수 있습니다.</p>
          </div>
          <StepCanvas
            step={selectedStep}
            screenshot={selectedScreenshot}
            editMode={canvasEditMode}
            onMarkerCommit={(stepId, point) => void handleMarkerCommit(stepId, point)}
            onCropCommit={(stepId, crop) => void handleCropCommit(stepId, crop)}
          />
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="m-0 text-sm font-bold">설명</h2>
          </div>

          {selectedStep ? (
            <div className="space-y-5 p-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-600">단계 제목</span>
                <input
                  value={selectedStep.title ?? selectedStep.targetText}
                  onChange={(event) => handleStepTitleChange(event.target.value)}
                  placeholder={getStepLabel(selectedStep)}
                  className="focus-ring w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-600">단계 설명</span>
                <textarea
                  value={selectedStep.note}
                  onChange={(event) => handleNoteChange(event.target.value)}
                  placeholder={getDefaultInstruction(selectedStep)}
                  className="focus-ring min-h-36 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm leading-6"
                />
              </label>

              <div className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-xs font-semibold text-slate-700">AI 문구 작성</h3>
                  {ALLOW_EXTERNAL_AI ? (
                    <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={aiEnabled}
                        onChange={(event) => handleAiEnabledChange(event.target.checked)}
                        className="h-4 w-4 accent-brand"
                      />
                      AI 사용
                    </label>
                  ) : null}
                </div>

                {!ALLOW_EXTERNAL_AI ? (
                  <p className="mb-0 mt-3 text-xs leading-5 text-slate-600">
                    관리자 정책으로 AI 기능이 비활성화되어 있습니다. 제목과 설명은 로컬에서
                    직접 작성할 수 있습니다.
                  </p>
                ) : aiEnabled ? (
                  <div className="mt-3 space-y-3">
                    <p className="m-0 text-xs font-semibold text-slate-700">
                      {selectedProviderMeta.label} · {selectedProviderMeta.model}
                    </p>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        Provider
                      </span>
                      <select
                        value={aiProvider}
                        onChange={(event) => {
                          setAiProvider(event.target.value as AiProvider);
                          setCopyStatus("");
                        }}
                        className="focus-ring w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                      >
                        {AI_PROVIDER_OPTIONS.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label} · {provider.model}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-600">
                        API 키
                      </span>
                      <input
                        type="password"
                        value={aiApiKeys[aiProvider]}
                        onChange={(event) =>
                          handleAiApiKeyChange(aiProvider, event.target.value)
                        }
                        placeholder={selectedProviderMeta.apiKeyPlaceholder}
                        className="focus-ring w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <p className="m-0 rounded-md bg-amber-50 p-2 text-xs leading-5 text-warn ring-1 ring-amber-200">
                      AI를 켜면 현재 단계의 스크린샷, 페이지 제목, URL, 클릭 대상 텍스트가
                      선택한 외부 AI API로 전송될 수 있습니다.
                    </p>
                    <Button
                      intent="primary"
                      disabled={copyGenerating}
                      onClick={() => void handleGenerateCopy()}
                    >
                      {copyGenerating ? "작성 중" : "문구 작성"}
                    </Button>
                    {copyStatus ? (
                      <p className="m-0 text-xs leading-5 text-slate-600">{copyStatus}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 space-y-1">
                    <p className="m-0 text-xs font-semibold text-slate-700">
                      꺼짐 · 로컬 직접 작성 모드
                    </p>
                    <p className="m-0 text-xs leading-5 text-slate-600">
                      AI 기능이 꺼져 있습니다. 제목과 설명을 직접 작성하면 모든 작업이
                      로컬에서 진행됩니다.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <h3 className="m-0 text-xs font-semibold text-slate-700">PDF 화면 자르기</h3>
                <p className="mb-3 mt-2 text-xs leading-5 text-slate-600">
                  출력에 남길 화면 영역만 미리보기에서 드래그하세요. PDF에서는 선택한
                  영역만 다른 페이지와 같은 규격 안에 맞춰 들어갑니다.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    intent={canvasEditMode === "marker" ? "primary" : "neutral"}
                    onClick={() => setCanvasEditMode("marker")}
                  >
                    마커 이동
                  </Button>
                  <Button
                    intent={canvasEditMode === "crop" ? "primary" : "neutral"}
                    onClick={() => setCanvasEditMode("crop")}
                  >
                    출력 영역 자르기
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="m-0 text-xs leading-5 text-slate-600">
                    {selectedCrop
                      ? `선택됨 · ${selectedCrop.width} x ${selectedCrop.height}`
                      : "선택된 출력 영역 없음"}
                  </p>
                  <Button
                    intent="danger"
                    disabled={!selectedCrop}
                    onClick={() => void handleClearCrop()}
                  >
                    해제
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="m-0 mb-2 text-xs font-semibold text-slate-600">클릭 대상</h3>
                <p className="m-0 rounded-md bg-panel p-3 text-sm leading-6">
                  {selectedStep.targetText || "대상 텍스트 없음"}
                </p>
              </div>

              <div>
                <h3 className="m-0 mb-2 text-xs font-semibold text-slate-600">페이지</h3>
                <dl className="m-0 space-y-3 rounded-md bg-panel p-3 text-xs leading-5 text-slate-600">
                  <div>
                    <dt className="font-semibold text-ink">제목</dt>
                    <dd className="m-0 break-words">{selectedStep.pageTitle || "-"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">URL</dt>
                    <dd className="m-0 break-all">{selectedStep.url}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink">좌표</dt>
                    <dd className="m-0">
                      x {selectedStep.markerX ?? selectedStep.x}, y{" "}
                      {selectedStep.markerY ?? selectedStep.y}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-line bg-panel p-3">
                <h3 className="m-0 text-xs font-semibold text-slate-700">로컬 데이터</h3>
                <p className="mb-3 mt-2 text-xs leading-5 text-slate-600">
                  캡처된 스크린샷과 단계 데이터는 Chrome IndexedDB에 저장됩니다.
                </p>
                <div className="grid gap-2">
                  <Button
                    intent="danger"
                    disabled={deleting}
                    onClick={() => void handleDeleteCurrentGuide()}
                  >
                    현재 가이드 삭제
                  </Button>
                  <Button
                    intent="danger"
                    disabled={deleting}
                    onClick={() => void handleDeleteAllLocalData()}
                  >
                    모든 로컬 기록 삭제
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <p className="m-0 text-sm text-slate-500">단계를 선택하세요.</p>
              <div className="rounded-lg border border-line bg-panel p-3">
                <h3 className="m-0 text-xs font-semibold text-slate-700">로컬 데이터</h3>
                <p className="mb-3 mt-2 text-xs leading-5 text-slate-600">
                  캡처된 스크린샷과 단계 데이터는 Chrome IndexedDB에 저장됩니다.
                </p>
                <div className="grid gap-2">
                  <Button
                    intent="danger"
                    disabled={deleting}
                    onClick={() => void handleDeleteCurrentGuide()}
                  >
                    현재 가이드 삭제
                  </Button>
                  <Button
                    intent="danger"
                    disabled={deleting}
                    onClick={() => void handleDeleteAllLocalData()}
                  >
                    모든 로컬 기록 삭제
                  </Button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<GuideEditor />);
