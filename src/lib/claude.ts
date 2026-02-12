import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AnalysisRequest {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  model?: string;
  /** Optional string to prefill the assistant turn (e.g. "{" to force JSON output). */
  prefill?: string;
}

export async function analyzeWithClaude(
  request: AnalysisRequest
): Promise<string> {
  const messages: { role: "user" | "assistant"; content: string }[] = [
    {
      role: "user",
      content: request.userMessage,
    },
  ];

  // Prefill forces Claude to continue from the given text, preventing code
  // fences or preamble before JSON output.
  if (request.prefill) {
    messages.push({ role: "assistant", content: request.prefill });
  }

  const response = await anthropic.messages.create({
    model: request.model || "claude-sonnet-4-20250514",
    max_tokens: request.maxTokens || 16384,
    system: request.systemPrompt,
    messages,
  });

  // Detect truncation — if stop_reason is "max_tokens", the response was cut off
  if (response.stop_reason === "max_tokens") {
    console.warn(
      `[Claude] Response truncated at max_tokens (${request.maxTokens || 16384}). ` +
      `Model: ${response.model}, Usage: ${JSON.stringify(response.usage)}`
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.text || "";

  // Prepend prefill so the caller gets the complete output
  return request.prefill ? request.prefill + text : text;
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
