export type SessionStatus = "recording" | "paused" | "completed";

export type EventType = "click" | "pointerdown";

export type CaptureSession = {
  id: string;
  status: SessionStatus;
  title: string;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
};

export type GuideStep = {
  id: string;
  sessionId: string;
  orderIndex: number;
  eventType: EventType;
  url: string;
  pageTitle: string;
  title?: string;
  targetText: string;
  x: number;
  y: number;
  markerX?: number;
  markerY?: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  viewportWidth: number;
  viewportHeight: number;
  screenshotId: string;
  note: string;
  createdAt: number;
};

export type ScreenshotAsset = {
  id: string;
  sessionId: string;
  stepId: string;
  blob: Blob;
  mimeType: "image/png";
  createdAt: number;
};

export type RecordedClickPayload = {
  eventType: EventType;
  url: string;
  pageTitle: string;
  targetText: string;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
};

export type RecorderStatus = {
  status: SessionStatus | "idle";
  sessionId?: string;
  title?: string;
  stepCount: number;
};

export type StepPatch = Partial<
  Pick<
    GuideStep,
    | "note"
    | "markerX"
    | "markerY"
    | "cropX"
    | "cropY"
    | "cropWidth"
    | "cropHeight"
    | "targetText"
    | "title"
  >
>;
