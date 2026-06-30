import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { MessageType, type RuntimeResponse } from "../shared/messages";
import type { RecorderStatus } from "../shared/types";

const initialStatus: RecorderStatus = {
  status: "idle",
  stepCount: 0
};

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Extension request failed"));
        return;
      }
      resolve(response.data);
    });
  });
}

function statusText(status: RecorderStatus["status"]): string {
  if (status === "recording") {
    return "녹화 중";
  }
  if (status === "paused") {
    return "일시정지";
  }
  return "녹화 중 아님";
}

function statusClass(status: RecorderStatus["status"]): string {
  if (status === "recording") {
    return "bg-red-50 text-danger ring-red-200";
  }
  if (status === "paused") {
    return "bg-amber-50 text-warn ring-amber-200";
  }
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

type ActionButtonProps = {
  children: React.ReactNode;
  disabled?: boolean;
  intent?: "primary" | "neutral" | "danger";
  onClick: () => void;
};

function ActionButton({
  children,
  disabled,
  intent = "neutral",
  onClick
}: ActionButtonProps): React.ReactElement {
  const className = {
    primary:
      "bg-brand text-white hover:bg-teal-800 active:bg-teal-900 disabled:hover:bg-brand",
    neutral:
      "bg-white text-ink ring-1 ring-line hover:bg-panel active:bg-slate-100 disabled:hover:bg-white",
    danger:
      "bg-white text-danger ring-1 ring-red-200 hover:bg-red-50 active:bg-red-100 disabled:hover:bg-white"
  }[intent];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`focus-ring h-10 w-full rounded-md px-3 text-sm font-semibold transition ${className}`}
    >
      {children}
    </button>
  );
}

function Popup(): React.ReactElement {
  const [status, setStatus] = useState<RecorderStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    const next = await sendMessage<RecorderStatus>({ type: MessageType.GetStatus });
    setStatus(next);
  }, []);

  useEffect(() => {
    void refreshStatus().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "상태를 불러올 수 없습니다.");
    });

    const listener = (message: unknown) => {
      const typed = message as { type?: string; status?: RecorderStatus };
      if (typed.type === MessageType.StatusUpdated && typed.status) {
        setStatus(typed.status);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refreshStatus]);

  const runAction = useCallback(async (message: unknown) => {
    setBusy(true);
    setError("");
    try {
      const next = await sendMessage<RecorderStatus>(message);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, []);

  const canRecord = status.status === "idle";
  const hasActiveSession = status.status === "recording" || status.status === "paused";
  const pauseLabel = status.status === "paused" ? "다시 시작" : "일시정지";
  const recordingHint = hasActiveSession
    ? status.stepCount === 0
      ? "기록된 단계가 0개입니다. 웹페이지를 클릭하면 단계와 스크린샷이 저장됩니다."
      : "녹화 종료를 누르면 저장 중인 캡처를 마친 뒤 편집 화면이 새 탭으로 열립니다."
    : "녹화 종료 후 편집 화면에서 PDF를 저장할 수 있습니다.";

  const subtitle = useMemo(() => {
    if (status.title && hasActiveSession) {
      return status.title;
    }
    return "웹 클릭을 단계별 가이드로 기록합니다.";
  }, [hasActiveSession, status.title]);

  return (
    <main className="w-[360px] bg-panel p-4 text-ink">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="m-0 text-base font-bold leading-tight">ClickGuide Local</h1>
            <p className="mt-1 max-w-[240px] truncate text-xs text-slate-600">{subtitle}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(
              status.status
            )}`}
          >
            {statusText(status.status)}
          </span>
        </div>
      </header>

      <section className="mb-4 rounded-lg border border-line bg-white p-3 shadow-tool">
        <div className="flex items-end justify-between">
          <div>
            <p className="m-0 text-xs font-medium text-slate-500">기록된 단계</p>
            <p className="m-0 mt-1 text-3xl font-bold leading-none">{status.stepCount}</p>
          </div>
          <p className="m-0 text-right text-xs leading-5 text-slate-500">
            클릭 시점마다
            <br />
            스크린샷 저장
          </p>
        </div>
      </section>

      <section className="grid gap-2">
        <ActionButton
          intent="primary"
          disabled={busy || !canRecord}
          onClick={() => runAction({ type: MessageType.StartRecording })}
        >
          녹화 시작
        </ActionButton>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            disabled={busy || !hasActiveSession}
            onClick={() => runAction({ type: MessageType.TogglePause })}
          >
            {pauseLabel}
          </ActionButton>
          <ActionButton
            disabled={busy || !hasActiveSession}
            onClick={() => runAction({ type: MessageType.StopRecording })}
          >
            녹화 종료 및 편집
          </ActionButton>
        </div>
        <ActionButton
          intent="danger"
          disabled={busy || !hasActiveSession || status.stepCount === 0}
          onClick={() => runAction({ type: MessageType.DeleteLastStep })}
        >
          마지막 단계 삭제
        </ActionButton>
      </section>

      <p
        className={`mb-0 mt-3 rounded-md p-2 text-xs leading-5 ring-1 ${
          hasActiveSession && status.stepCount === 0
            ? "bg-amber-50 text-amber-900 ring-amber-200"
            : "bg-white text-slate-600 ring-line"
        }`}
      >
        {recordingHint}
      </p>

      {error ? (
        <p className="mb-0 mt-3 rounded-md bg-red-50 p-2 text-xs leading-5 text-danger ring-1 ring-red-200">
          {error}
        </p>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
