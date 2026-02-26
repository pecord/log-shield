import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface LLMClient {
  analyze(systemPrompt: string, userPrompt: string): Promise<string>;
  isAvailable(): boolean;
  providerName(): string;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Retry wrapper with exponential backoff and 429 handling.
 * Respects Retry-After header when available.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (attempt === maxRetries) throw error;

      // Check for rate limit (429) or transient server errors (5xx)
      const status = getErrorStatus(error);
      const isRetryable = status === 429 || (status !== null && status >= 500);

      if (!isRetryable && status !== null) throw error;

      // Calculate delay: exponential backoff, or Retry-After header
      let delayMs = baseDelayMs * Math.pow(2, attempt);
      const retryAfter = getRetryAfter(error);
      if (retryAfter !== null) {
        delayMs = Math.max(delayMs, retryAfter * 1000);
      }

      console.warn(
        `[LLM] Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delayMs)}ms...`,
        status ? `status=${status}` : ""
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("withRetry: exhausted retries");
}

function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    if ("status" in error && typeof (error as { status: unknown }).status === "number") {
      return (error as { status: number }).status;
    }
    if ("statusCode" in error && typeof (error as { statusCode: unknown }).statusCode === "number") {
      return (error as { statusCode: number }).statusCode;
    }
  }
  return null;
}

function getRetryAfter(error: unknown): number | null {
  if (error && typeof error === "object" && "headers" in error) {
    const headers = (error as { headers: Record<string, string> }).headers;
    if (headers && typeof headers === "object") {
      const val = headers["retry-after"] || headers["Retry-After"];
      if (val) {
        const seconds = parseFloat(val);
        if (!isNaN(seconds)) return seconds;
      }
    }
  }
  return null;
}

class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(systemPrompt: string, userPrompt: string): Promise<string> {
    return withRetry(async () => {
      const message = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const block = message.content[0];
      if (block.type === "text") {
        return block.text;
      }
      return "";
    });
  }

  isAvailable(): boolean {
    return true;
  }

  providerName(): string {
    return "Anthropic Claude";
  }
}

class OpenAIClient implements LLMClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async analyze(systemPrompt: string, userPrompt: string): Promise<string> {
    return withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      return response.choices[0]?.message?.content || "";
    });
  }

  isAvailable(): boolean {
    return true;
  }

  providerName(): string {
    return "OpenAI";
  }
}

class NullClient implements LLMClient {
  async analyze(): Promise<string> {
    return "[]";
  }
  isAvailable(): boolean {
    return false;
  }
  providerName(): string {
    return "None";
  }
}

export interface LLMOverride {
  provider: "anthropic" | "openai";
  apiKey: string;
}

export function createLLMClient(override?: LLMOverride): LLMClient {
  // User override takes priority
  if (override) {
    if (override.provider === "anthropic") {
      return new AnthropicClient(override.apiKey);
    }
    return new OpenAIClient(override.apiKey);
  }

  // Fall back to env vars
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicClient(process.env.ANTHROPIC_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIClient(process.env.OPENAI_API_KEY);
  }
  return new NullClient();
}
