import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import {
  deleteStep,
  getLatestSession,
  getScreenshotsForSteps,
  getSession,
  getSteps,
  moveStep,
  patchStep,
  updateSessionTitle
} from "../shared/db";
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

type StepCanvasProps = {
  step: GuideStep | undefined;
  screenshot: ScreenshotAsset | undefined;
  onMarkerCommit: (stepId: string, point: MarkerPoint) => void;
};

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
  onMarkerCommit
}: StepCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const draftPointRef = useRef<MarkerPoint | null>(null);

  const draw = useCallback(
    (draftStep?: GuideStep) => {
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

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !step || !isClientPointNearMarker(step, canvas, event.clientX, event.clientY)) {
      return;
    }

    draggingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    updateDraftMarker(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) {
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

    const point = draftPointRef.current;
    draftPointRef.current = null;
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
          className="max-h-full max-w-full cursor-grab rounded-md border border-line bg-white shadow-tool active:cursor-grabbing"
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
  const [error, setError] = useState("");

  const selectedStep = useMemo(
    () => steps.find((step) => step.id === selectedStepId) ?? steps[0],
    [selectedStepId, steps]
  );
  const selectedScreenshot = selectedStep ? screenshots.get(selectedStep.id) : undefined;

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

  const updateStepLocal = useCallback((stepId: string, patch: Partial<GuideStep>) => {
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
    );
  }, []);

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
            onMarkerCommit={(stepId, point) => void handleMarkerCommit(stepId, point)}
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
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-500">단계를 선택하세요.</p>
          )}
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<GuideEditor />);
