import type {
  CompressionResult,
  OptimizationSuggestion,
  OptimizationTechnique,
  TokenBreakdown,
} from "./types.js";
import { estimateTokens } from "./tokenizer.js";

const WARNING_THRESHOLD = 0.7;

export function generateSuggestions(
  breakdown: TokenBreakdown[],
  totalTokens: number,
  contextWindowSize: number
): OptimizationSuggestion[] {
  if (totalTokens / contextWindowSize < WARNING_THRESHOLD) return [];

  const suggestions: OptimizationSuggestion[] = [];

  for (const section of breakdown) {
    if (section.tokens < 500) continue;

    if (section.section === "Conversation History" && section.tokens > 5000) {
      suggestions.push({
        id: "summarize-history",
        section: section.section,
        currentTokens: section.tokens,
        estimatedTokens: Math.ceil(section.tokens * 0.3),
        savingsTokens: Math.ceil(section.tokens * 0.7),
        savingsPercentage: 70,
        technique: "summarize",
        description:
          "Summarize older conversation turns into a compact block, retaining only key decisions and context.",
        actionable: true,
      });
    }

    if (section.section === "File Attachments" && section.tokens > 3000) {
      suggestions.push({
        id: "truncate-files",
        section: section.section,
        currentTokens: section.tokens,
        estimatedTokens: Math.ceil(section.tokens * 0.5),
        savingsTokens: Math.ceil(section.tokens * 0.5),
        savingsPercentage: 50,
        technique: "truncate",
        description:
          "Read only the relevant portions of large files using offset/limit parameters.",
        actionable: true,
      });
    }

    if (section.section === "Tool Results" && section.tokens > 2000) {
      suggestions.push({
        id: "compress-tool-results",
        section: section.section,
        currentTokens: section.tokens,
        estimatedTokens: Math.ceil(section.tokens * 0.4),
        savingsTokens: Math.ceil(section.tokens * 0.6),
        savingsPercentage: 60,
        technique: "remove-redundancy",
        description:
          "Prune verbose tool outputs (long file listings, full stack traces) to key lines only.",
        actionable: true,
      });
    }
  }

  return suggestions.sort((a, b) => b.savingsTokens - a.savingsTokens);
}

export function compressContent(
  content: string,
  techniques: OptimizationTechnique[]
): CompressionResult {
  const originalTokens = estimateTokens(content);
  let compressed = content;

  if (techniques.includes("remove-redundancy")) {
    compressed = removeRedundantLines(compressed);
  }
  if (techniques.includes("compress-patterns")) {
    compressed = compressRepeatedPatterns(compressed);
  }
  if (techniques.includes("deduplicate")) {
    compressed = deduplicateLines(compressed);
  }

  const compressedTokens = estimateTokens(compressed);
  const savingsTokens = originalTokens - compressedTokens;

  return {
    original: content,
    compressed,
    originalTokens,
    compressedTokens,
    savingsTokens,
    savingsPercentage:
      originalTokens > 0
        ? Math.round((savingsTokens / originalTokens) * 1000) / 10
        : 0,
    techniques,
  };
}

function removeRedundantLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function deduplicateLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split("\n")
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join("\n");
}

function compressRepeatedPatterns(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}
