const MESSAGE = {
  ClickRecorded: "CLICKGUIDE_CLICK_RECORDED",
  ContentReady: "CLICKGUIDE_CONTENT_READY",
  SetRecorderEnabled: "CLICKGUIDE_SET_RECORDER_ENABLED"
} as const;

const FRAME_MESSAGE_TYPE = "CLICKGUIDE_FRAME_CLICK_RECORDED";
const DUPLICATE_CLICK_WINDOW_MS = 750;
const DUPLICATE_CLICK_DISTANCE = 8;

type SourceEventType = "click" | "pointerdown";

type RecordedPayload = {
  eventType: SourceEventType;
  url: string;
  pageTitle: string;
  targetText: string;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
};

type FrameClickMessage = {
  source: "ClickGuideLocal";
  type: typeof FRAME_MESSAGE_TYPE;
  payload: RecordedPayload;
};

let enabled = false;
const recorderWindow = window as Window & { __clickGuideRecorderLoaded?: boolean };
let lastSent:
  | {
      eventType: SourceEventType;
      x: number;
      y: number;
      targetText: string;
      timestamp: number;
    }
  | undefined;

function getEventElement(value: EventTarget | null): Element | null {
  return value instanceof Element ? value : null;
}

function isSensitiveTarget(target: Element): boolean {
  const passwordInput = target.closest('input[type="password"]');
  if (passwordInput) {
    return true;
  }

  return Boolean(target.closest("[data-clickguide-ignore='true'], [data-clickguide-ignore]"));
}

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function isLikelyInteractive(target: Element): boolean {
  const interactive = target.closest(
    [
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "[role='button']",
      "[role='menuitem']",
      "[role='tab']",
      "[role='option']",
      "[onclick]",
      "[tabindex]",
      ".btn",
      ".button",
      ".x-btn",
      ".ant-btn",
      ".el-button",
      ".k-button"
    ].join(",")
  );

  if (interactive) {
    return true;
  }

  if (target instanceof HTMLElement) {
    return window.getComputedStyle(target).cursor === "pointer";
  }

  return false;
}

function getTargetText(target: Element): string {
  const meaningfulTarget =
    target.closest<HTMLElement>(
      "button, a, [role='button'], [aria-label], [title], label, input, textarea, select"
    ) ??
    (target instanceof HTMLElement ? target : target.parentElement);

  if (!meaningfulTarget) {
    return "";
  }

  if (meaningfulTarget instanceof HTMLInputElement) {
    if (meaningfulTarget.type === "password") {
      return "";
    }

    if (["button", "submit", "reset"].includes(meaningfulTarget.type)) {
      return compactText(
        meaningfulTarget.getAttribute("aria-label") ||
          meaningfulTarget.value ||
          meaningfulTarget.getAttribute("title")
      );
    }

    return compactText(
      meaningfulTarget.getAttribute("aria-label") ||
        meaningfulTarget.getAttribute("title") ||
        meaningfulTarget.getAttribute("placeholder") ||
        meaningfulTarget.name
    );
  }

  if (meaningfulTarget instanceof HTMLTextAreaElement) {
    return compactText(
      meaningfulTarget.getAttribute("aria-label") ||
        meaningfulTarget.getAttribute("title") ||
        meaningfulTarget.getAttribute("placeholder") ||
        meaningfulTarget.name
    );
  }

  return compactText(
    meaningfulTarget.innerText ||
      meaningfulTarget.getAttribute("aria-label") ||
      meaningfulTarget.getAttribute("title") ||
      meaningfulTarget.textContent
  );
}

function buildPayload(event: MouseEvent | PointerEvent, target: Element, eventType: SourceEventType): RecordedPayload {
  return {
    eventType,
    url: window.location.href,
    pageTitle: document.title,
    targetText: getTargetText(target),
    x: event.clientX,
    y: event.clientY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    timestamp: Date.now()
  };
}

function isDuplicateClickAfterPointer(payload: RecordedPayload): boolean {
  if (!lastSent || payload.eventType !== "click" || lastSent.eventType !== "pointerdown") {
    return false;
  }

  const elapsed = payload.timestamp - lastSent.timestamp;
  const distance = Math.hypot(payload.x - lastSent.x, payload.y - lastSent.y);
  return (
    elapsed >= 0 &&
    elapsed <= DUPLICATE_CLICK_WINDOW_MS &&
    distance <= DUPLICATE_CLICK_DISTANCE &&
    payload.targetText === lastSent.targetText
  );
}

function rememberSent(payload: RecordedPayload): void {
  lastSent = {
    eventType: payload.eventType,
    x: payload.x,
    y: payload.y,
    targetText: payload.targetText,
    timestamp: payload.timestamp
  };
}

function sendPayload(payload: RecordedPayload): void {
  if (isDuplicateClickAfterPointer(payload)) {
    return;
  }

  rememberSent(payload);

  if (!isTopFrame()) {
    window.parent.postMessage(
      {
        source: "ClickGuideLocal",
        type: FRAME_MESSAGE_TYPE,
        payload
      } satisfies FrameClickMessage,
      "*"
    );
    return;
  }

  chrome.runtime.sendMessage({
    type: MESSAGE.ClickRecorded,
    payload
  });
}

function findSourceFrame(source: MessageEventSource | null): HTMLFrameElement | HTMLIFrameElement | undefined {
  if (!source) {
    return undefined;
  }

  const frames = Array.from(document.querySelectorAll<HTMLFrameElement | HTMLIFrameElement>("iframe, frame"));
  return frames.find((frame) => {
    try {
      return frame.contentWindow === source;
    } catch {
      return false;
    }
  });
}

function isFrameClickMessage(value: unknown): value is FrameClickMessage {
  const message = value as Partial<FrameClickMessage>;
  return message?.source === "ClickGuideLocal" && message.type === FRAME_MESSAGE_TYPE && Boolean(message.payload);
}

function handleFrameClickMessage(event: MessageEvent): void {
  if (!enabled || !isFrameClickMessage(event.data)) {
    return;
  }

  const frame = findSourceFrame(event.source);
  if (!frame) {
    return;
  }

  const rect = frame.getBoundingClientRect();
  const payload = event.data.payload;
  const scaleX = rect.width / Math.max(payload.viewportWidth, 1);
  const scaleY = rect.height / Math.max(payload.viewportHeight, 1);
  const adjustedPayload: RecordedPayload = {
    ...payload,
    x: rect.left + payload.x * scaleX,
    y: rect.top + payload.y * scaleY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };

  sendPayload(adjustedPayload);
}

function handleClick(event: MouseEvent): void {
  const target = getEventElement(event.target);
  if (!enabled || !event.isTrusted || !target) {
    return;
  }

  if (isSensitiveTarget(target)) {
    return;
  }

  sendPayload(buildPayload(event, target, "click"));
}

function handlePointerDown(event: PointerEvent): void {
  const target = getEventElement(event.target);
  if (
    !enabled ||
    !event.isTrusted ||
    event.button !== 0 ||
    !target ||
    !isLikelyInteractive(target) ||
    isSensitiveTarget(target)
  ) {
    return;
  }

  sendPayload(buildPayload(event, target, "pointerdown"));
}

function requestInitialState(): void {
  chrome.runtime.sendMessage({ type: MESSAGE.ContentReady }, (response) => {
    if (!response?.ok || !response.data) {
      return;
    }
    enabled = response.data.status === "recording";
  });
}

if (!recorderWindow.__clickGuideRecorderLoaded) {
  recorderWindow.__clickGuideRecorderLoaded = true;

  window.addEventListener("message", handleFrameClickMessage);
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("click", handleClick, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE.SetRecorderEnabled) {
      return;
    }
    enabled = Boolean(message.enabled);
  });

  requestInitialState();
}
