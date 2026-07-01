import {
  addRecordedStep,
  createSession,
  deleteLastStep,
  getActiveSession,
  getStepCount,
  setSessionStatus
} from "../shared/db";
import { MessageType, type RuntimeResponse } from "../shared/messages";
import type { RecordedClickPayload, RecorderStatus } from "../shared/types";

const CAPTURE_INTERVAL_MS = 650;
const MAX_URL_LENGTH = 4096;
const MAX_PAGE_TITLE_LENGTH = 512;
const MAX_TARGET_TEXT_LENGTH = 512;

let captureQueue: Promise<void> = Promise.resolve();
let lastCaptureAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRestrictedUrl(url: string): boolean {
  return /^(chrome|edge|about|devtools|chrome-extension):/i.test(url);
}

function isBrowserInternalUrl(url: string): boolean {
  return /^(chrome|edge|devtools|chrome-extension):/i.test(url);
}

function isRecordablePageUrl(url: string): boolean {
  if (isRestrictedUrl(url)) {
    return false;
  }

  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidClickPayload(value: unknown): value is RecordedClickPayload {
  const payload = value as Partial<RecordedClickPayload>;

  return (
    (payload.eventType === "click" || payload.eventType === "pointerdown") &&
    typeof payload.url === "string" &&
    typeof payload.pageTitle === "string" &&
    typeof payload.targetText === "string" &&
    payload.url.length > 0 &&
    payload.url.length <= MAX_URL_LENGTH &&
    payload.pageTitle.length <= MAX_PAGE_TITLE_LENGTH &&
    payload.targetText.length <= MAX_TARGET_TEXT_LENGTH &&
    isFiniteNumber(payload.x) &&
    isFiniteNumber(payload.y) &&
    isFiniteNumber(payload.viewportWidth) &&
    isFiniteNumber(payload.viewportHeight) &&
    isFiniteNumber(payload.timestamp) &&
    payload.viewportWidth > 0 &&
    payload.viewportHeight > 0 &&
    payload.x >= 0 &&
    payload.y >= 0 &&
    payload.x <= payload.viewportWidth &&
    payload.y <= payload.viewportHeight
  );
}

function isFromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return Boolean(sender.url?.startsWith(chrome.runtime.getURL("")));
}

function isFromContentScript(sender: chrome.runtime.MessageSender): boolean {
  return (
    typeof sender.tab?.id === "number" &&
    !isFromExtensionPage(sender) &&
    (sender.frameId === undefined || sender.frameId === 0)
  );
}

function isFromAnyContentScriptFrame(sender: chrome.runtime.MessageSender): boolean {
  return typeof sender.tab?.id === "number" && !isFromExtensionPage(sender);
}

async function isSenderActiveTab(sender: chrome.runtime.MessageSender): Promise<boolean> {
  if (typeof sender.tab?.id !== "number" || typeof sender.tab.windowId !== "number") {
    return false;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    windowId: sender.tab.windowId
  });
  return tabs[0]?.id === sender.tab.id;
}

function isSameOriginAsSender(
  payloadUrl: string,
  sender: chrome.runtime.MessageSender
): boolean {
  if (!sender.url) {
    return true;
  }

  try {
    // Hash/router changes can make exact URL equality too brittle for SPA pages.
    return new URL(payloadUrl).origin === new URL(sender.url).origin;
  } catch {
    return false;
  }
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

async function isRecordingTab(tabId: number): Promise<boolean> {
  const status = await getStatus();
  if (status.status !== "recording") {
    return false;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    return Boolean(tab.active && tab.url && isRecordablePageUrl(tab.url));
  } catch {
    return false;
  }
}

async function getInjectableFrameIds(tabId: number): Promise<number[]> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const frameIds =
      frames
        ?.filter((frame) => !isBrowserInternalUrl(frame.url))
        .map((frame) => frame.frameId) ?? [];

    return frameIds.includes(0) ? frameIds : [0, ...frameIds];
  } catch {
    return [0];
  }
}

async function injectRecorderIntoFrame(tabId: number, frameId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ["assets/recorder.js"]
    });
    return true;
  } catch {
    // Restricted or sandboxed frames cannot receive content scripts.
    return false;
  }
}

async function ensureRecorderInjected(tabId: number): Promise<void> {
  const frameIds = await getInjectableFrameIds(tabId);
  await Promise.all(frameIds.map((frameId) => injectRecorderIntoFrame(tabId, frameId)));
}

async function sendRecorderStateToFrame(
  tabId: number,
  frameId: number,
  enabled: boolean,
  status: RecorderStatus
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(
      tabId,
      {
        type: MessageType.SetRecorderEnabled,
        enabled,
        status
      },
      { frameId }
    );
  } catch {
    // The frame may not have a content script yet or may be restricted.
  }
}

async function sendRecorderStateToTab(
  tabId: number,
  enabled: boolean,
  status: RecorderStatus
): Promise<void> {
  const frameIds = await getInjectableFrameIds(tabId);
  await Promise.all(
    frameIds.map((frameId) => sendRecorderStateToFrame(tabId, frameId, enabled, status))
  );
}

async function updateActiveTabRecorderState(enabled: boolean): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url || !isRecordablePageUrl(tab.url)) {
    return;
  }

  await ensureRecorderInjected(tab.id);
  await sendRecorderStateToTab(tab.id, enabled, await getStatus());
}

async function enableRecorderForNavigatedFrame(details: {
  tabId: number;
  frameId: number;
  url: string;
}): Promise<void> {
  if (details.tabId < 0 || isBrowserInternalUrl(details.url)) {
    return;
  }

  if (!(await isRecordingTab(details.tabId))) {
    return;
  }

  const injected = await injectRecorderIntoFrame(details.tabId, details.frameId);
  if (!injected) {
    return;
  }

  await sendRecorderStateToFrame(details.tabId, details.frameId, true, await getStatus());
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
  payload: unknown,
  sender: chrome.runtime.MessageSender
): Promise<RecorderStatus> {
  const session = await getActiveSession();
  if (!session || session.status !== "recording") {
    return getStatus();
  }

  if (
    !isValidClickPayload(payload) ||
    !isRecordablePageUrl(payload.url) ||
    !isSameOriginAsSender(payload.url, sender) ||
    !(await isSenderActiveTab(sender))
  ) {
    return getStatus();
  }

  const screenshotBlob = await captureScreenshot(sender);
  await addRecordedStep(session.id, payload, screenshotBlob);
  return broadcastStatus();
}

function enqueueClick(
  payload: unknown,
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

type MessageLike = {
  type?: string;
  payload?: unknown;
};

function isAllowedMessageSender(
  message: MessageLike,
  sender: chrome.runtime.MessageSender
): boolean {
  switch (message.type) {
    case MessageType.StartRecording:
    case MessageType.TogglePause:
    case MessageType.StopRecording:
    case MessageType.DeleteLastStep:
    case MessageType.GetStatus:
      return isFromExtensionPage(sender);
    case MessageType.ContentReady:
      return isFromAnyContentScriptFrame(sender);
    case MessageType.ClickRecorded:
      return isFromContentScript(sender);
    default:
      return false;
  }
}

async function handleMessage(
  message: MessageLike,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  if (!isAllowedMessageSender(message, sender)) {
    return getStatus();
  }

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
      if (sender.tab?.id && typeof sender.frameId === "number") {
        await sendRecorderStateToFrame(
          sender.tab.id,
          sender.frameId,
          status.status === "recording",
          status
        );
      }
      return status;
    }
    case MessageType.ClickRecorded:
      return enqueueClick(message.payload, sender);
    default:
      return getStatus();
  }
}

chrome.runtime.onMessage.addListener((message: MessageLike, sender, sendResponse) => {
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

chrome.webNavigation.onCommitted.addListener((details) => {
  void enableRecorderForNavigatedFrame(details);
});

chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  void enableRecorderForNavigatedFrame(details);
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void enableRecorderForNavigatedFrame(details);
});
