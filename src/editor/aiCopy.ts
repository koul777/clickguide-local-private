import {
  drawMarkerOnContext,
  loadImageFromBlob
} from "../shared/markerCanvas";
import type { CaptureSession, GuideStep, ScreenshotAsset } from "../shared/types";

export type AiProvider = "openai" | "gemini" | "claude";

export type AiGeneratedCopy = {
  title: string;
  note: string;
};

export type AiProviderConfig = {
  label: string;
  model: string;
  apiKeyPlaceholder: string;
};

export const AI_PROVIDERS: Record<AiProvider, AiProviderConfig> = {
  openai: {
    label: "ChatGPT",
    model: "gpt-5.4-mini",
    apiKeyPlaceholder: "OpenAI API key"
  },
  gemini: {
    label: "Gemini",
    model: "gemini-3.5-flash",
    apiKeyPlaceholder: "Google AI Studio API key"
  },
  claude: {
    label: "Claude",
    model: "claude-sonnet-4-6",
    apiKeyPlaceholder: "Anthropic API key"
  }
};

const MAX_SCREENSHOT_EDGE = 1600;

type GenerateStepCopyInput = {
  provider: AiProvider;
  apiKey: string;
  session: CaptureSession;
  step: GuideStep;
  totalSteps: number;
  screenshot: ScreenshotAsset;
};

type PreparedScreenshot = {
  dataUrl: string;
  base64: string;
  mimeType: "image/jpeg";
};

function cleanSingleLine(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function cleanMultiLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

async function prepareScreenshot(step: GuideStep, screenshot: ScreenshotAsset): Promise<PreparedScreenshot> {
  const image = await loadImageFromBlob(screenshot.blob);
  const maxEdge = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = Math.min(1, MAX_SCREENSHOT_EDGE / maxEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  context.drawImage(image, 0, 0, width, height);
  drawMarkerOnContext(context, step, width, height);

  const mimeType = "image/jpeg";
  const dataUrl = canvas.toDataURL(mimeType, 0.88);
  return {
    dataUrl,
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mimeType
  };
}

function buildPrompt(session: CaptureSession, step: GuideStep, totalSteps: number): string {
  return [
    "You write concise Korean step-by-step guide copy for ClickGuide Local.",
    "The attached screenshot is the current browser screen. A red numbered marker shows the recorded click point.",
    "Return only valid JSON with this exact shape: {\"title\":\"...\",\"description\":\"...\"}.",
    "Rules:",
    "- title: Korean, 8-24 characters, direct action label, no final period.",
    "- description: Korean, 1-2 sentences, explain exactly what the user should do on this screen.",
    "- Do not mention AI, screenshots, coordinates, JSON, or internal implementation details.",
    "- Prefer the clicked target text and visible UI context over generic wording.",
    "",
    `Guide title: ${session.title}`,
    `Step: ${step.orderIndex + 1} of ${totalSteps}`,
    `Page title: ${step.pageTitle || "-"}`,
    `Page URL: ${step.url || "-"}`,
    `Clicked target text: ${step.targetText || "-"}`,
    `Current title: ${step.title || "-"}`,
    `Current description: ${step.note || "-"}`
  ].join("\n");
}

function getErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const error = "error" in payload ? payload.error : undefined;
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return undefined;
}

async function parseApiResponse<T>(response: Response, providerLabel: string): Promise<T> {
  const payload = (await response.json().catch(() => undefined)) as T | undefined;
  if (!response.ok) {
    const detail = getErrorMessage(payload);
    throw new Error(detail || `${providerLabel} API request failed (${response.status})`);
  }
  if (!payload) {
    throw new Error(`${providerLabel} API returned an empty response`);
  }
  return payload;
}

function parseGeneratedCopy(rawText: string): AiGeneratedCopy {
  const text = rawText.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const title = cleanSingleLine(parsed.title, 60);
  const note = cleanMultiLine(parsed.description ?? parsed.note, 600);

  if (!title || !note) {
    throw new Error("AI response did not include both title and description");
  }

  return { title, note };
}

function extractOpenAiText(payload: unknown): string {
  if (payload && typeof payload === "object" && "output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!payload || typeof payload !== "object" || !("output" in payload) || !Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) =>
      item && typeof item === "object" && "content" in item && Array.isArray(item.content)
        ? item.content
        : []
    )
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      if ("text" in part && typeof part.text === "string") {
        return part.text;
      }
      if ("output_text" in part && typeof part.output_text === "string") {
        return part.output_text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

function extractGeminiText(payload: unknown): string {
  if (payload && typeof payload === "object" && "output_text" in payload && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (payload && typeof payload === "object" && "steps" in payload && Array.isArray(payload.steps)) {
    return payload.steps
      .filter((step: unknown) => step && typeof step === "object" && "type" in step && step.type === "model_output")
      .flatMap((step: unknown) =>
        step && typeof step === "object" && "content" in step && Array.isArray(step.content)
          ? step.content
          : []
      )
      .map((part: unknown) =>
        part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string"
          ? part.text
          : ""
      )
      .join("\n")
      .trim();
  }

  if (!payload || typeof payload !== "object" || !("candidates" in payload) || !Array.isArray(payload.candidates)) {
    return "";
  }

  const candidate = payload.candidates[0];
  if (!candidate || typeof candidate !== "object" || !("content" in candidate)) {
    return "";
  }
  const content = candidate.content;
  if (!content || typeof content !== "object" || !("parts" in content) || !Array.isArray(content.parts)) {
    return "";
  }

  const parts: unknown[] = content.parts;
  return parts
    .map((part: unknown) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function extractClaudeText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("content" in payload) || !Array.isArray(payload.content)) {
    return "";
  }

  const content: unknown[] = payload.content;
  return content
    .map((part: unknown) => (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

async function generateWithOpenAi(
  apiKey: string,
  model: string,
  prompt: string,
  screenshot: PreparedScreenshot
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: screenshot.dataUrl, detail: "high" }
          ]
        }
      ],
      max_output_tokens: 500,
      temperature: 0.2,
      store: false
    })
  });
  const payload = await parseApiResponse<unknown>(response, "ChatGPT");
  return extractOpenAiText(payload);
}

async function generateWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
  screenshot: PreparedScreenshot
): Promise<string> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: prompt },
        {
          type: "image",
          data: screenshot.base64,
          mime_type: screenshot.mimeType
        }
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" }
          },
          required: ["title", "description"],
          additionalProperties: false
        }
      },
      generation_config: {
        max_output_tokens: 500,
        temperature: 0.2
      },
      store: false
    })
  });
  const payload = await parseApiResponse<unknown>(response, "Gemini");
  return extractGeminiText(payload);
}

async function generateWithClaude(
  apiKey: string,
  model: string,
  prompt: string,
  screenshot: PreparedScreenshot
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: screenshot.mimeType,
                data: screenshot.base64
              }
            },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });
  const payload = await parseApiResponse<unknown>(response, "Claude");
  return extractClaudeText(payload);
}

export async function generateStepCopy({
  provider,
  apiKey,
  session,
  step,
  totalSteps,
  screenshot
}: GenerateStepCopyInput): Promise<AiGeneratedCopy> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error("API key is required");
  }

  const providerConfig = AI_PROVIDERS[provider];
  const prompt = buildPrompt(session, step, totalSteps);
  const preparedScreenshot = await prepareScreenshot(step, screenshot);
  const rawText =
    provider === "openai"
      ? await generateWithOpenAi(trimmedApiKey, providerConfig.model, prompt, preparedScreenshot)
      : provider === "gemini"
        ? await generateWithGemini(trimmedApiKey, providerConfig.model, prompt, preparedScreenshot)
        : await generateWithClaude(trimmedApiKey, providerConfig.model, prompt, preparedScreenshot);

  if (!rawText) {
    throw new Error(`${providerConfig.label} API returned no text`);
  }

  try {
    return parseGeneratedCopy(rawText);
  } catch {
    throw new Error("AI response could not be parsed as title and description JSON");
  }
}
