import type { GuideStep, RecordedClickPayload } from "./types";

export function cleanTargetText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function cleanStepTitle(value: string | undefined | null): string {
  return cleanTargetText(value);
}

export function getStepTitle(step: Pick<GuideStep, "orderIndex" | "targetText" | "title">): string {
  return cleanStepTitle(step.title) || cleanTargetText(step.targetText) || `${step.orderIndex + 1}단계`;
}

export function getStepLabel(step: GuideStep): string {
  return getStepTitle(step);
}

export function getDefaultInstruction(
  step: Pick<GuideStep, "targetText"> | Pick<RecordedClickPayload, "targetText">
): string {
  const target = cleanTargetText(step.targetText);
  return target ? `"${target}"을 클릭하세요.` : "표시된 위치를 클릭하세요.";
}
