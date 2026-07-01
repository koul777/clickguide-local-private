const MESSAGE = {
  ClickRecorded: "CLICKGUIDE_CLICK_RECORDED",
  ContentReady: "CLICKGUIDE_CONTENT_READY",
  SetRecorderEnabled: "CLICKGUIDE_SET_RECORDER_ENABLED"
} as const;

const DUPLICATE_CLICK_WINDOW_MS = 750;
const DUPLICATE_CLICK_DISTANCE = 8;
const REDACTION_STYLE_ID = "clickguide-redaction-style";
const FRAME_MESSAGE_TYPE = "CLICKGUIDE_FRAME_CLICK_RECORDED";

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

function isRedactedTarget(target: Element): boolean {
  return Boolean(target.closest("[data-clickguide-redact]"));
}

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

function getParentTargetOrigin(): string | undefined {
  try {
    return window.parent.location.origin;
  } catch {
    const ancestorOrigins = (window.location as Location & { ancestorOrigins?: DOMStringList })
      .ancestorOrigins;
    const parentOrigin = ancestorOrigins?.[0];
    if (parentOrigin) {
      return parentOrigin;
    }

    try {
      return document.referrer ? new URL(document.referrer).origin : undefined;
    } catch {
      return undefined;
    }
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
      "area",
      "img",
      "svg",
      "canvas",
      "[role='button']",
      "[role='menuitem']",
      "[role='tab']",
      "[role='option']",
      "[onclick]",
      "[tabindex]",
      "[class*='btn']",
      "[class*='button']",
      "[class*='Button']",
      "[class*='icon']",
      "[class*='Icon']",
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
  if (isRedactedTarget(target)) {
    return "";
  }

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

function isDuplicateRecentPayload(payload: RecordedPayload): boolean {
  if (!lastSent) {
    return false;
  }

  const elapsed = payload.timestamp - lastSent.timestamp;
  const distance = Math.hypot(payload.x - lastSent.x, payload.y - lastSent.y);

  if (
    payload.eventType === "pointerdown" &&
    lastSent.eventType === "pointerdown" &&
    elapsed >= 0 &&
    elapsed <= 120 &&
    distance <= DUPLICATE_CLICK_DISTANCE
  ) {
    return true;
  }

  return (
    payload.eventType === "click" &&
    lastSent.eventType === "pointerdown" &&
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

function applyRedactionsForCapture(): () => void {
  const existing = document.getElementById(REDACTION_STYLE_ID);
  if (existing) {
    return () => undefined;
  }

  const style = document.createElement("style");
  style.id = REDACTION_STYLE_ID;
  style.textContent = `
    [data-clickguide-redact],
    input[type="password"] {
      background: #111827 !important;
      border-color: #111827 !important;
      box-shadow: none !important;
      color: transparent !important;
      caret-color: transparent !important;
      text-shadow: none !important;
    }
    [data-clickguide-redact] *,
    input[type="password"]::placeholder {
      visibility: hidden !important;
      color: transparent !important;
    }
  `;
  document.documentElement.appendChild(style);

  return () => {
    style.remove();
  };
}

function sendPayload(payload: RecordedPayload): void {
  if (!isTopFrame()) {
    window.parent.postMessage(
      {
        source: "ClickGuideLocal",
        type: FRAME_MESSAGE_TYPE,
        payload
      } satisfies FrameClickMessage,
      getParentTargetOrigin() ?? "*"
    );
    return;
  }

  if (isDuplicateRecentPayload(payload)) {
    return;
  }

  rememberSent(payload);

  const restoreRedactions = applyRedactionsForCapture();
  let restored = false;
  const restoreOnce = () => {
    if (restored) {
      return;
    }
    restored = true;
    restoreRedactions();
  };
  const fallbackTimer = window.setTimeout(restoreOnce, 5000);

  chrome.runtime.sendMessage(
    {
      type: MESSAGE.ClickRecorded,
      payload
    },
    () => {
      window.clearTimeout(fallbackTimer);
      restoreOnce();
    }
  );
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

function isTrustedFrameMessage(
  event: MessageEvent,
  frame: HTMLFrameElement | HTMLIFrameElement,
  payload: RecordedPayload
): boolean {
  // Dynamic ERP frames are often about:blank/srcdoc/sandboxed and report an opaque "null" origin.
  // The source window has already been matched to a real child frame in this page.
  if (event.origin === "null" || event.origin === "") {
    return true;
  }

  if (event.origin === window.location.origin) {
    return true;
  }

  try {
    if (new URL(frame.src, window.location.href).origin === event.origin) {
      return true;
    }
  } catch {
    // Some ERP frames navigate after initial load; fall back to the payload URL origin.
  }

  try {
    return new URL(payload.url).origin === event.origin;
  } catch {
    return false;
  }
}

function handleFrameClickMessage(event: MessageEvent): void {
  if (!enabled || !isFrameClickMessage(event.data)) {
    return;
  }

  const frame = findSourceFrame(event.source);
  if (!frame) {
    return;
  }

  const payload = event.data.payload;
  if (!isTrustedFrameMessage(event, frame, payload)) {
    return;
  }

  const rect = frame.getBoundingClientRect();
  const scaleX = rect.width / Math.max(payload.viewportWidth, 1);
  const scaleY = rect.height / Math.max(payload.viewportHeight, 1);
  const adjustedPayload: RecordedPayload = {
    ...payload,
    url: window.location.href,
    pageTitle: document.title,
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
    isSensitiveTarget(target)
  ) {
    return;
  }

  sendPayload(buildPayload(event, target, "pointerdown"));
}

function handleMouseDown(event: MouseEvent): void {
  const target = getEventElement(event.target);
  if (!enabled || !event.isTrusted || event.button !== 0 || !target || isSensitiveTarget(target)) {
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
  document.addEventListener("mousedown", handleMouseDown, true);
  document.addEventListener("click", handleClick, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE.SetRecorderEnabled) {
      return;
    }
    enabled = Boolean(message.enabled);
  });

  requestInitialState();
}
