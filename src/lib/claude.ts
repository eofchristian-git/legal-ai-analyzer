import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AnalysisRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  model?: string;
}

export async function analyzeWithClaude(
  request: AnalysisRequest
): Promise<string> {
  const response = await anthropic.messages.create({
    model: request.model || "claude-sonnet-4-20250514",
    max_tokens: request.maxTokens || 8192,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: request.userMessage,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

export function createClaudeStream(request: AnalysisRequest) {
  return anthropic.messages.stream({
    model: request.model || "claude-sonnet-4-20250514",
    max_tokens: request.maxTokens || 8192,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: request.userMessage,
      },
    ],
  });
}
