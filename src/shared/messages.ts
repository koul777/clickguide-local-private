import type { RecordedClickPayload, RecorderStatus } from "./types";

export const MessageType = {
  StartRecording: "CLICKGUIDE_START_RECORDING",
  TogglePause: "CLICKGUIDE_TOGGLE_PAUSE",
  StopRecording: "CLICKGUIDE_STOP_RECORDING",
  DeleteLastStep: "CLICKGUIDE_DELETE_LAST_STEP",
  GetStatus: "CLICKGUIDE_GET_STATUS",
  ClickRecorded: "CLICKGUIDE_CLICK_RECORDED",
  ContentReady: "CLICKGUIDE_CONTENT_READY",
  SetRecorderEnabled: "CLICKGUIDE_SET_RECORDER_ENABLED",
  StatusUpdated: "CLICKGUIDE_STATUS_UPDATED"
} as const;

export type RuntimeMessage =
  | { type: typeof MessageType.StartRecording }
  | { type: typeof MessageType.TogglePause }
  | { type: typeof MessageType.StopRecording }
  | { type: typeof MessageType.DeleteLastStep }
  | { type: typeof MessageType.GetStatus }
  | { type: typeof MessageType.ClickRecorded; payload: RecordedClickPayload }
  | { type: typeof MessageType.ContentReady }
  | {
      type: typeof MessageType.SetRecorderEnabled;
      enabled: boolean;
      status: RecorderStatus;
    }
  | { type: typeof MessageType.StatusUpdated; status: RecorderStatus };

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
