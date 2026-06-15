import type { GuideStep, RecordedClickPayload } from "./types";

export function cleanTargetText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function getStepLabel(step: GuideStep): string {
  const target = cleanTargetText(step.targetText);
  return target || `Step ${step.orderIndex + 1}`;
}

export function getDefaultInstruction(
  step: Pick<GuideStep, "targetText"> | Pick<RecordedClickPayload, "targetText">
): string {
  const target = cleanTargetText(step.targetText);
  return target ? `"${target}"을 클릭하세요.` : "표시된 위치를 클릭하세요.";
}
