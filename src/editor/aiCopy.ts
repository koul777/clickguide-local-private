import type { GuideStep, ScreenshotAsset } from "../shared/types";
import type { AiProvider } from "./aiProviderMeta";

type GenerateStepCopyInput = {
  provider: AiProvider;
  apiKey: string;
  step: GuideStep;
  screenshot?: ScreenshotAsset;
};

export type GeneratedStepCopy = {
  title: string;
  note: string;
};

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";

function buildPrompt(step: GuideStep): string {
  return [
    "ClickGuide Local의 단계별 업무 가이드 문구를 작성해 주세요.",
    "반드시 JSON만 반환하세요. 형식: {\"title\":\"...\",\"note\":\"...\"}",
    "title은 40자 이내의 짧은 단계 제목으로 작성하세요.",
    "note는 사용자가 다음 행동을 이해할 수 있는 한국어 설명 한 문단으로 작성하세요.",
    `페이지 제목: ${step.pageTitle || "-"}`,
    `URL: ${step.url}`,
    `클릭 대상 텍스트: ${step.targetText || "-"}`,
    `좌표: x ${Math.round(step.markerX ?? step.x)}, y ${Math.round(step.markerY ?? step.y)}`
  ].join("\n");
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function parseGeneratedCopy(text: string, step: GuideStep): GeneratedStepCopy {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      title: cleanText(step.targetText || step.pageTitle, "단계 확인", 40),
      note: cleanText(text, "현재 단계의 화면과 클릭 위치를 확인합니다.", 500)
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<GeneratedStepCopy>;
    return {
      title: cleanText(parsed.title, step.targetText || "단계 확인", 40),
      note: cleanText(parsed.note, "현재 단계의 화면과 클릭 위치를 확인합니다.", 500)
    };
  } catch {
    return {
      title: cleanText(step.targetText || step.pageTitle, "단계 확인", 40),
      note: cleanText(text, "현재 단계의 화면과 클릭 위치를 확인합니다.", 500)
    };
  }
}

function assertOk(response: Response, provider: AiProvider): void {
  if (!response.ok) {
    throw new Error(`${provider} API 요청에 실패했습니다. (${response.status})`);
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("스크린샷을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function screenshotToBase64(screenshot?: ScreenshotAsset): Promise<string | undefined> {
  if (!screenshot) {
    return undefined;
  }

  const dataUrl = await blobToDataUrl(screenshot.blob);
  return dataUrl.split(",", 2)[1];
}

async function screenshotToDataUrl(screenshot?: ScreenshotAsset): Promise<string | undefined> {
  if (!screenshot) {
    return undefined;
  }

  return blobToDataUrl(screenshot.blob);
}

function extractOpenAiText(value: unknown): string {
  const response = value as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  if (response.output_text) {
    return response.output_text;
  }

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("\n") ?? ""
  );
}

async function generateWithOpenAi(input: GenerateStepCopyInput): Promise<GeneratedStepCopy> {
  const imageUrl = await screenshotToDataUrl(input.screenshot);
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: buildPrompt(input.step)
    }
  ];

  if (imageUrl) {
    content.push({
      type: "input_image",
      image_url: imageUrl,
      detail: "low"
    });
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content
        }
      ],
      temperature: 0.2
    })
  });

  assertOk(response, input.provider);
  const data = (await response.json()) as unknown;
  return parseGeneratedCopy(extractOpenAiText(data), input.step);
}

async function generateWithGemini(input: GenerateStepCopyInput): Promise<GeneratedStepCopy> {
  const base64 = await screenshotToBase64(input.screenshot);
  const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(input.step) }];

  if (base64) {
    parts.push({
      inlineData: {
        mimeType: input.screenshot?.mimeType ?? "image/png",
        data: base64
      }
    });
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(input.apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    })
  });

  assertOk(response, input.provider);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  return parseGeneratedCopy(text, input.step);
}

async function generateWithClaude(input: GenerateStepCopyInput): Promise<GeneratedStepCopy> {
  const base64 = await screenshotToBase64(input.screenshot);
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: buildPrompt(input.step)
    }
  ];

  if (base64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: input.screenshot?.mimeType ?? "image/png",
        data: base64
      }
    });
  }

  const response = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 700,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  assertOk(response, input.provider);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.map((item) => item.text ?? "").join("\n") ?? "";
  return parseGeneratedCopy(text, input.step);
}

export async function generateStepCopy(
  input: GenerateStepCopyInput
): Promise<GeneratedStepCopy> {
  switch (input.provider) {
    case "openai":
      return generateWithOpenAi(input);
    case "gemini":
      return generateWithGemini(input);
    case "claude":
      return generateWithClaude(input);
    default:
      throw new Error("지원하지 않는 AI provider입니다.");
  }
}
