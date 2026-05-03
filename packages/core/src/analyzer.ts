import type { AnalysisInput, TokenBreakdown, TokenReport } from "./types.js";
import {
  estimateTokens,
  estimateTokensForRecord,
  getContextWindowSize,
} from "./tokenizer.js";
import { generateSuggestions } from "./optimizer.js";

const TOP_CONSUMERS_LIMIT = 5;

export function analyzeTokens(input: AnalysisInput): TokenReport {
  const contextWindowSize =
    input.contextWindowSize ?? getContextWindowSize();

  const sections: TokenBreakdown[] = [];

  if (input.systemPrompt) {
    sections.push({
      section: "System Prompt",
      tokens: estimateTokens(input.systemPrompt),
      percentage: 0,
      description: "Base system prompt injected by Claude Code",
    });
  }

  if (input.injectedSkills) {
    sections.push({
      section: "Injected Skills",
      tokens: estimateTokens(input.injectedSkills),
      percentage: 0,
      description: "SKILL.md files loaded into context",
    });
  }

  if (input.injectedRules) {
    sections.push({
      section: "Injected Rules",
      tokens: estimateTokens(input.injectedRules),
      percentage: 0,
      description: "CLAUDE.md and rules files",
    });
  }

  if (input.conversationHistory) {
    sections.push({
      section: "Conversation History",
      tokens: estimateTokens(input.conversationHistory),
      percentage: 0,
      description: "All prior turns in the current session",
    });
  }

  if (input.fileAttachments && Object.keys(input.fileAttachments).length > 0) {
    sections.push({
      section: "File Attachments",
      tokens: estimateTokensForRecord(input.fileAttachments),
      percentage: 0,
      description: `${Object.keys(input.fileAttachments).length} file(s) read into context`,
    });
  }

  if (input.toolResults) {
    sections.push({
      section: "Tool Results",
      tokens: estimateTokens(input.toolResults),
      percentage: 0,
      description: "Bash, Read, and other tool outputs",
    });
  }

  if (input.pendingMessage) {
    sections.push({
      section: "Pending Message",
      tokens: estimateTokens(input.pendingMessage),
      percentage: 0,
      description: "Current user message being processed",
    });
  }

  const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);

  const breakdown = sections.map((s) => ({
    ...s,
    percentage:
      totalTokens > 0
        ? Math.round((s.tokens / totalTokens) * 1000) / 10
        : 0,
  }));

  const topConsumers = [...breakdown]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, TOP_CONSUMERS_LIMIT);

  const percentageUsed =
    Math.round((totalTokens / contextWindowSize) * 1000) / 10;

  return {
    totalTokens,
    contextWindowSize,
    percentageUsed,
    percentageRemaining: Math.round((100 - percentageUsed) * 10) / 10,
    breakdown,
    topConsumers,
    suggestions: generateSuggestions(breakdown, totalTokens, contextWindowSize),
    trend: "stable",
    generatedAt: new Date().toISOString(),
  };
}
