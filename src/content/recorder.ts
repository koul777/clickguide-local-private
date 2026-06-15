const MESSAGE = {
  ClickRecorded: "CLICKGUIDE_CLICK_RECORDED",
  ContentReady: "CLICKGUIDE_CONTENT_READY",
  SetRecorderEnabled: "CLICKGUIDE_SET_RECORDER_ENABLED"
} as const;

let enabled = false;
const recorderWindow = window as Window & { __clickGuideRecorderLoaded?: boolean };

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

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
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

function buildPayload(event: MouseEvent, target: Element) {
  return {
    eventType: "click",
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

function handleClick(event: MouseEvent): void {
  const target = getEventElement(event.target);
  if (!enabled || !event.isTrusted || !target) {
    return;
  }

  if (isSensitiveTarget(target)) {
    return;
  }

  chrome.runtime.sendMessage({
    type: MESSAGE.ClickRecorded,
    payload: buildPayload(event, target)
  });
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

  document.addEventListener("click", handleClick, true);
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE.SetRecorderEnabled) {
      return;
    }
    enabled = Boolean(message.enabled);
  });

  requestInitialState();
}
