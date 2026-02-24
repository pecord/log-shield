import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface LLMClient {
  analyze(systemPrompt: string, userPrompt: string): Promise<string>;
  isAvailable(): boolean;
  providerName(): string;
}

class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyze(systemPrompt: string, userPrompt: string): Promise<string> {
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
    const response = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return response.choices[0]?.message?.content || "";
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

export function createLLMClient(): LLMClient {
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicClient(process.env.ANTHROPIC_API_KEY);
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIClient(process.env.OPENAI_API_KEY);
  }
  return new NullClient();
}
