// Anthropic does not publish the exact tokenizer. The cl100k_base tokenizer
// averages ~4 chars/token for English prose and ~3.5 for code; we use 3.8 as
// a blended constant matching the "~4 chars per token" convention from Anthropic docs.
const CHARS_PER_TOKEN = 3.8;

export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateTokensForRecord(record: Record<string, string>): number {
  return Object.values(record).reduce(
    (sum, value) => sum + estimateTokens(value),
    0
  );
}

export function getContextWindowSize(modelId?: string): number {
  if (!modelId) return 200_000;
  // All Claude 3/4 series: 200k context window
  if (modelId.startsWith("claude-")) return 200_000;
  return 200_000;
}
