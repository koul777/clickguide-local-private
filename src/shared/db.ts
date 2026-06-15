import type {
  CaptureSession,
  GuideStep,
  RecordedClickPayload,
  ScreenshotAsset,
  SessionStatus,
  StepPatch
} from "./types";
import { cleanTargetText } from "./stepText";

const DB_NAME = "clickguide-local";
const DB_VERSION = 1;

const STORE = {
  Sessions: "sessions",
  Steps: "steps",
  Screenshots: "screenshots"
} as const;

let dbPromise: Promise<IDBDatabase> | undefined;

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openClickGuideDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Cannot open IndexedDB"));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE.Sessions)) {
        const sessions = db.createObjectStore(STORE.Sessions, { keyPath: "id" });
        sessions.createIndex("status", "status", { unique: false });
        sessions.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE.Steps)) {
        const steps = db.createObjectStore(STORE.Steps, { keyPath: "id" });
        steps.createIndex("bySession", "sessionId", { unique: false });
        steps.createIndex("bySessionOrder", ["sessionId", "orderIndex"], {
          unique: false
        });
      }

      if (!db.objectStoreNames.contains(STORE.Screenshots)) {
        const screenshots = db.createObjectStore(STORE.Screenshots, {
          keyPath: "id"
        });
        screenshots.createIndex("bySession", "sessionId", { unique: false });
        screenshots.createIndex("byStep", "stepId", { unique: true });
      }
    };
  });

  return dbPromise;
}

export async function createSession(title?: string): Promise<CaptureSession> {
  const now = Date.now();
  const session: CaptureSession = {
    id: createId("session"),
    status: "recording",
    title: title || `ClickGuide ${new Date(now).toLocaleString()}`,
    startedAt: now,
    updatedAt: now
  };

  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Sessions, "readwrite");
  transaction.objectStore(STORE.Sessions).add(session);
  await transactionDone(transaction);
  return session;
}

export async function getSession(sessionId: string): Promise<CaptureSession | undefined> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Sessions, "readonly");
  const session = await requestToPromise<CaptureSession | undefined>(
    transaction.objectStore(STORE.Sessions).get(sessionId)
  );
  await transactionDone(transaction);
  return session;
}

export async function getAllSessions(): Promise<CaptureSession[]> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Sessions, "readonly");
  const sessions = await requestToPromise<CaptureSession[]>(
    transaction.objectStore(STORE.Sessions).getAll()
  );
  await transactionDone(transaction);
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getLatestSession(): Promise<CaptureSession | undefined> {
  const sessions = await getAllSessions();
  return sessions[0];
}

export async function getActiveSession(): Promise<CaptureSession | undefined> {
  const sessions = await getAllSessions();
  return sessions.find((session) => session.status === "recording" || session.status === "paused");
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    return;
  }

  await putSession({
    ...session,
    title: title.trim() || "Untitled guide",
    updatedAt: Date.now()
  });
}

export async function setSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<CaptureSession | undefined> {
  const session = await getSession(sessionId);
  if (!session) {
    return undefined;
  }

  const now = Date.now();
  const next: CaptureSession = {
    ...session,
    status,
    updatedAt: now,
    endedAt: status === "completed" ? now : session.endedAt
  };
  await putSession(next);
  return next;
}

async function putSession(session: CaptureSession): Promise<void> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Sessions, "readwrite");
  transaction.objectStore(STORE.Sessions).put(session);
  await transactionDone(transaction);
}

export async function getSteps(sessionId: string): Promise<GuideStep[]> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Steps, "readonly");
  const index = transaction.objectStore(STORE.Steps).index("bySession");
  const steps = await requestToPromise<GuideStep[]>(
    index.getAll(IDBKeyRange.only(sessionId))
  );
  await transactionDone(transaction);
  return steps.sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function getStepCount(sessionId: string): Promise<number> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Steps, "readonly");
  const index = transaction.objectStore(STORE.Steps).index("bySession");
  const count = await requestToPromise<number>(index.count(IDBKeyRange.only(sessionId)));
  await transactionDone(transaction);
  return count;
}

export async function addRecordedStep(
  sessionId: string,
  payload: RecordedClickPayload,
  screenshotBlob: Blob
): Promise<GuideStep> {
  const session = await getSession(sessionId);
  if (!session || session.status !== "recording") {
    throw new Error("No recording session is active");
  }

  const existingSteps = await getSteps(sessionId);
  const now = Date.now();
  const stepId = createId("step");
  const screenshotId = createId("screenshot");

  const step: GuideStep = {
    id: stepId,
    sessionId,
    orderIndex: existingSteps.length,
    eventType: payload.eventType,
    url: payload.url,
    pageTitle: payload.pageTitle,
    targetText: cleanTargetText(payload.targetText),
    x: Math.round(payload.x),
    y: Math.round(payload.y),
    viewportWidth: Math.round(payload.viewportWidth),
    viewportHeight: Math.round(payload.viewportHeight),
    screenshotId,
    note: "",
    createdAt: payload.timestamp || now
  };

  const screenshot: ScreenshotAsset = {
    id: screenshotId,
    sessionId,
    stepId,
    blob: screenshotBlob,
    mimeType: "image/png",
    createdAt: now
  };

  const db = await openClickGuideDb();
  const transaction = db.transaction(
    [STORE.Sessions, STORE.Steps, STORE.Screenshots],
    "readwrite"
  );
  transaction.objectStore(STORE.Steps).add(step);
  transaction.objectStore(STORE.Screenshots).add(screenshot);
  transaction.objectStore(STORE.Sessions).put({
    ...session,
    updatedAt: now
  });
  await transactionDone(transaction);
  return step;
}

export async function getScreenshot(screenshotId: string): Promise<ScreenshotAsset | undefined> {
  const db = await openClickGuideDb();
  const transaction = db.transaction(STORE.Screenshots, "readonly");
  const screenshot = await requestToPromise<ScreenshotAsset | undefined>(
    transaction.objectStore(STORE.Screenshots).get(screenshotId)
  );
  await transactionDone(transaction);
  return screenshot;
}

export async function getScreenshotsForSteps(
  steps: GuideStep[]
): Promise<Map<string, ScreenshotAsset>> {
  const result = new Map<string, ScreenshotAsset>();
  await Promise.all(
    steps.map(async (step) => {
      const screenshot = await getScreenshot(step.screenshotId);
      if (screenshot) {
        result.set(step.id, screenshot);
      }
    })
  );
  return result;
}

export async function patchStep(stepId: string, patch: StepPatch): Promise<GuideStep | undefined> {
  const db = await openClickGuideDb();
  const transaction = db.transaction([STORE.Steps, STORE.Sessions], "readwrite");
  const stepStore = transaction.objectStore(STORE.Steps);
  const step = await requestToPromise<GuideStep | undefined>(stepStore.get(stepId));
  if (!step) {
    await transactionDone(transaction);
    return undefined;
  }

  const next: GuideStep = {
    ...step,
    ...patch,
    targetText: patch.targetText === undefined ? step.targetText : cleanTargetText(patch.targetText)
  };
  stepStore.put(next);

  const sessionStore = transaction.objectStore(STORE.Sessions);
  const session = await requestToPromise<CaptureSession | undefined>(
    sessionStore.get(step.sessionId)
  );
  if (session) {
    sessionStore.put({ ...session, updatedAt: Date.now() });
  }

  await transactionDone(transaction);
  return next;
}

export async function deleteLastStep(sessionId: string): Promise<void> {
  const steps = await getSteps(sessionId);
  const last = steps.at(-1);
  if (!last) {
    return;
  }
  await deleteStep(sessionId, last.id);
}

export async function deleteStep(sessionId: string, stepId: string): Promise<void> {
  const steps = await getSteps(sessionId);
  const step = steps.find((item) => item.id === stepId);
  if (!step) {
    return;
  }

  const nextSteps = steps.filter((item) => item.id !== stepId);
  const db = await openClickGuideDb();
  const transaction = db.transaction(
    [STORE.Sessions, STORE.Steps, STORE.Screenshots],
    "readwrite"
  );

  const stepStore = transaction.objectStore(STORE.Steps);
  const screenshotStore = transaction.objectStore(STORE.Screenshots);
  stepStore.delete(stepId);
  screenshotStore.delete(step.screenshotId);

  nextSteps.forEach((item, index) => {
    stepStore.put({ ...item, orderIndex: index });
  });

  const sessionStore = transaction.objectStore(STORE.Sessions);
  const session = await requestToPromise<CaptureSession | undefined>(sessionStore.get(sessionId));
  if (session) {
    sessionStore.put({ ...session, updatedAt: Date.now() });
  }

  await transactionDone(transaction);
}

export async function moveStep(
  sessionId: string,
  stepId: string,
  direction: "up" | "down"
): Promise<void> {
  const steps = await getSteps(sessionId);
  const currentIndex = steps.findIndex((step) => step.id === stepId);
  if (currentIndex < 0) {
    return;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= steps.length) {
    return;
  }

  const reordered = [...steps];
  const [current] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, current);

  const db = await openClickGuideDb();
  const transaction = db.transaction([STORE.Sessions, STORE.Steps], "readwrite");
  const stepStore = transaction.objectStore(STORE.Steps);

  reordered.forEach((step, index) => {
    stepStore.put({ ...step, orderIndex: index });
  });

  const sessionStore = transaction.objectStore(STORE.Sessions);
  const session = await requestToPromise<CaptureSession | undefined>(sessionStore.get(sessionId));
  if (session) {
    sessionStore.put({ ...session, updatedAt: Date.now() });
  }

  await transactionDone(transaction);
}
