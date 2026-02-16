import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Set timeout to 3 minutes (180 seconds) to match maxDuration in API route
  // Prevents "Streaming is required for operations that may take longer than 10 minutes" error
  timeout: 180 * 1000, // 180 seconds in milliseconds
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
    max_tokens: request.maxTokens || 32000,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: request.userMessage,
      },
    ],
  });

  // Detect truncation — if stop_reason is "max_tokens", the response was cut off
  if (response.stop_reason === "max_tokens") {
    console.warn(
      `[Claude] Response truncated at max_tokens (${request.maxTokens || 32000}). ` +
      `Model: ${response.model}, Usage: ${JSON.stringify(response.usage)}`
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock?.text || "";
}

export function createClaudeStream(request: AnalysisRequest) {
  return anthropic.messages.stream({
    model: request.model || "claude-sonnet-4-20250514",
    max_tokens: request.maxTokens || 32000,
    system: request.systemPrompt,
    messages: [
      {
        role: "user",
        content: request.userMessage,
      },
    ],
  });
}
