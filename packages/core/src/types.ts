export interface TokenBreakdown {
  section: string;
  tokens: number;
  percentage: number;
  description?: string;
}

export interface OptimizationSuggestion {
  id: string;
  section: string;
  currentTokens: number;
  estimatedTokens: number;
  savingsTokens: number;
  savingsPercentage: number;
  technique: OptimizationTechnique;
  description: string;
  actionable: boolean;
}

export type OptimizationTechnique =
  | "remove-redundancy"
  | "summarize"
  | "use-reference"
  | "compress-patterns"
  | "truncate"
  | "deduplicate";

export interface TokenReport {
  totalTokens: number;
  contextWindowSize: number;
  percentageUsed: number;
  percentageRemaining: number;
  breakdown: TokenBreakdown[];
  topConsumers: TokenBreakdown[];
  suggestions: OptimizationSuggestion[];
  trend: "growing" | "stable" | "shrinking";
  generatedAt: string;
}

export interface AnalysisInput {
  systemPrompt?: string;
  injectedSkills?: string;
  injectedRules?: string;
  conversationHistory?: string;
  fileAttachments?: Record<string, string>;
  toolResults?: string;
  pendingMessage?: string;
  contextWindowSize?: number;
}

export interface CompressionResult {
  original: string;
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  savingsTokens: number;
  savingsPercentage: number;
  techniques: OptimizationTechnique[];
}
