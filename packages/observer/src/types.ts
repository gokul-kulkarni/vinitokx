// Transcript record types — what we read from ~/.claude/projects/<hash>/<session>.jsonl

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export type ContentBlock = ToolUseBlock | TextBlock | { type: string };

export interface UsageBlock {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface AssistantRecord {
  type: "assistant";
  uuid: string;
  timestamp: string;
  sessionId: string;
  cwd?: string;
  gitBranch?: string;
  message: {
    model: string;
    role: "assistant";
    content: ContentBlock[];
    usage: UsageBlock;
  };
}

export interface UserRecord {
  type: "user";
  uuid: string;
  timestamp: string;
  sessionId: string;
}

export type TranscriptRecord = AssistantRecord | UserRecord | { type: string };

// Aggregated report types

export interface ModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  estimatedCostUsd: number | null;
}

export interface ToolStats {
  tool: string;
  calls: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ToolModelStats {
  tool: string;
  model: string;
  calls: number;
}

export interface ReportFilters {
  scope: "current-project" | "all" | "explicit-project";
  projectPath?: string;
  sessionId?: string;
  since?: string;
  until?: string;
}

export interface Report {
  filters: ReportFilters;
  sessionsScanned: number;
  turnsScanned: number;
  malformedLinesSkipped: number;
  unpricedModels: string[];
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  byModel: ModelStats[];
  byTool: ToolStats[];
  byToolModel: ToolModelStats[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCostUsd: number;
  };
}

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
