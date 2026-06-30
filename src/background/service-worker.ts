import {
  addRecordedStep,
  createSession,
  deleteLastStep,
  getActiveSession,
  getStepCount,
  setSessionStatus
} from "../shared/db";
import { MessageType, type RuntimeMessage, type RuntimeResponse } from "../shared/messages";
import type { RecordedClickPayload, RecorderStatus } from "../shared/types";

const CAPTURE_INTERVAL_MS = 650;

let captureQueue: Promise<void> = Promise.resolve();
let lastCaptureAt = 0;

function isRestrictedUrl(url: string): boolean {
  return /^(chrome|edge|about|devtools|chrome-extension):\/\//i.test(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function getStatus(): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session) {
    return { status: "idle", stepCount: 0 };
  }

  return {
    status: session.status,
    sessionId: session.id,
    title: session.title,
    stepCount: await getStepCount(session.id)
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function ensureRecorderInjected(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["assets/recorder.js"]
    });
  } catch {
    // Restricted browser pages cannot receive content scripts.
  }
}

async function sendRecorderStateToTab(
  tabId: number,
  enabled: boolean,
  status: RecorderStatus
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: MessageType.SetRecorderEnabled,
      enabled,
      status
    });
  } catch {
    // The tab may not have a content script yet or may be a restricted page.
  }
}

async function updateActiveTabRecorderState(enabled: boolean): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || isRestrictedUrl(tab.url)) {
    return;
  }

  await ensureRecorderInjected(tab.id);
  await sendRecorderStateToTab(tab.id, enabled, await getStatus());
}

async function broadcastStatus(): Promise<RecorderStatus> {
  const status = await getStatus();
  try {
    await chrome.runtime.sendMessage({
      type: MessageType.StatusUpdated,
      status
    });
  } catch {
    // Popup/editor listeners are optional.
  }
  return status;
}

async function startRecording(): Promise<RecorderStatus> {
  const active = await getActiveSession();
  const session = active?.status === "paused" ? await setSessionStatus(active.id, "recording") : active;

  if (!session) {
    await createSession();
  }

  await updateActiveTabRecorderState(true);
  return broadcastStatus();
}

async function togglePause(): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session) {
    return getStatus();
  }

  const nextStatus = session.status === "recording" ? "paused" : "recording";
  await setSessionStatus(session.id, nextStatus);
  await updateActiveTabRecorderState(nextStatus === "recording");
  return broadcastStatus();
}

async function stopRecording(): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session) {
    return getStatus();
  }

  await captureQueue.catch(() => undefined);
  await setSessionStatus(session.id, "completed");
  await updateActiveTabRecorderState(false);
  const editorUrl = chrome.runtime.getURL(`guide-editor.html?sessionId=${session.id}`);
  await chrome.tabs.create({ url: editorUrl });
  return broadcastStatus();
}

async function deleteLastRecordedStep(): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session) {
    return getStatus();
  }

  await deleteLastStep(session.id);
  return broadcastStatus();
}

async function captureScreenshot(sender: chrome.runtime.MessageSender): Promise<Blob> {
  const elapsed = Date.now() - lastCaptureAt;
  if (elapsed < CAPTURE_INTERVAL_MS) {
    await sleep(CAPTURE_INTERVAL_MS - elapsed);
  }

  lastCaptureAt = Date.now();
  const dataUrl = await captureVisibleTab(sender.tab?.windowId);
  return dataUrlToBlob(dataUrl);
}

function captureVisibleTab(windowId: number | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const callback = (dataUrl: string) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(dataUrl);
    };

    if (typeof windowId === "number") {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, callback);
      return;
    }

    chrome.tabs.captureVisibleTab({ format: "png" }, callback);
  });
}

async function recordClick(
  payload: RecordedClickPayload,
  sender: chrome.runtime.MessageSender
): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session || session.status !== "recording") {
    return getStatus();
  }

  if (isRestrictedUrl(payload.url) || isRestrictedUrl(sender.url ?? "")) {
    return getStatus();
  }

  const screenshotBlob = await captureScreenshot(sender);
  await addRecordedStep(session.id, payload, screenshotBlob);
  return broadcastStatus();
}

function enqueueClick(
  payload: RecordedClickPayload,
  sender: chrome.runtime.MessageSender
): Promise<RecorderStatus> {
  let result: RecorderStatus = { status: "idle", stepCount: 0 };
  captureQueue = captureQueue
    .catch(() => undefined)
    .then(async () => {
      result = await recordClick(payload, sender);
    });

  return captureQueue.then(() => result);
}

async function handleMessage(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (message.type) {
    case MessageType.StartRecording:
      return startRecording();
    case MessageType.TogglePause:
      return togglePause();
    case MessageType.StopRecording:
      return stopRecording();
    case MessageType.DeleteLastStep:
      return deleteLastRecordedStep();
    case MessageType.GetStatus:
      return getStatus();
    case MessageType.ContentReady: {
      const status = await getStatus();
      if (sender.tab?.id) {
        await sendRecorderStateToTab(sender.tab.id, status.status === "recording", status);
      }
      return status;
    }
    case MessageType.ClickRecorded:
      return enqueueClick(message.payload, sender);
    default:
      return getStatus();
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => {
      const response: RuntimeResponse = { ok: true, data };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const response: RuntimeResponse = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extension error"
      };
      sendResponse(response);
    });

  return true;
});

chrome.tabs.onActivated.addListener(() => {
  void getStatus().then((status) => {
    void updateActiveTabRecorderState(status.status === "recording");
  });
});
