import type {
  AssistantRecord,
  ModelPrice,
  ModelStats,
  Report,
  ReportFilters,
  ToolStats,
  ToolModelStats,
  ToolUseBlock,
} from "./types.js";
import { priceFor } from "./pricing.js";

interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turns: number;
  estimatedCostUsd: number;
  hasPricing: boolean;
}

interface ToolAccumulator {
  calls: number;
  turnIds: Set<string>;
  inputTokens: number;
  outputTokens: number;
}

export interface AggregatorState {
  modelMap: Map<string, ModelAccumulator>;
  toolMap: Map<string, ToolAccumulator>;
  toolModelMap: Map<string, number>; // key: `${tool}|${model}`
  unpriced: Set<string>;
  earliest: string | null;
  latest: string | null;
  sessionIds: Set<string>;
  turnsScanned: number;
}

export function createState(): AggregatorState {
  return {
    modelMap: new Map(),
    toolMap: new Map(),
    toolModelMap: new Map(),
    unpriced: new Set(),
    earliest: null,
    latest: null,
    sessionIds: new Set(),
    turnsScanned: 0,
  };
}

export function ingestRecord(
  state: AggregatorState,
  record: AssistantRecord,
  prices: Record<string, ModelPrice>
): void {
  state.turnsScanned += 1;
  state.sessionIds.add(record.sessionId);

  if (state.earliest === null || record.timestamp < state.earliest) {
    state.earliest = record.timestamp;
  }
  if (state.latest === null || record.timestamp > state.latest) {
    state.latest = record.timestamp;
  }

  const usage = record.message.usage;
  const model = record.message.model;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  // Per-model aggregation (exact)
  let modelAcc = state.modelMap.get(model);
  if (!modelAcc) {
    modelAcc = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 0,
      estimatedCostUsd: 0,
      hasPricing: prices[model] !== undefined,
    };
    state.modelMap.set(model, modelAcc);
  }
  modelAcc.inputTokens += inputTokens;
  modelAcc.outputTokens += outputTokens;
  modelAcc.cacheReadTokens += cacheRead;
  modelAcc.cacheWriteTokens += cacheWrite;
  modelAcc.turns += 1;

  const cost = priceFor(model, usage, prices);
  if (cost === null) {
    state.unpriced.add(model);
  } else {
    modelAcc.estimatedCostUsd += cost;
  }

  // Per-tool aggregation (equal-split among tool_uses in this turn)
  const toolUses = record.message.content.filter(
    (c): c is ToolUseBlock =>
      typeof c === "object" && c !== null && (c as { type?: string }).type === "tool_use"
  );
  const n = toolUses.length;
  if (n === 0) return;

  const sharedInput = inputTokens / n;
  const sharedOutput = outputTokens / n;

  for (const tool of toolUses) {
    let toolAcc = state.toolMap.get(tool.name);
    if (!toolAcc) {
      toolAcc = {
        calls: 0,
        turnIds: new Set(),
        inputTokens: 0,
        outputTokens: 0,
      };
      state.toolMap.set(tool.name, toolAcc);
    }
    toolAcc.calls += 1;
    toolAcc.turnIds.add(record.uuid);
    toolAcc.inputTokens += sharedInput;
    toolAcc.outputTokens += sharedOutput;

    const key = `${tool.name}|${model}`;
    state.toolModelMap.set(key, (state.toolModelMap.get(key) ?? 0) + 1);
  }
}

export function buildReport(
  state: AggregatorState,
  filters: ReportFilters,
  malformedLinesSkipped: number
): Report {
  const byModel: ModelStats[] = [];
  let totalInput = 0,
    totalOutput = 0,
    totalCacheRead = 0,
    totalCacheWrite = 0,
    totalCost = 0;

  for (const [model, acc] of state.modelMap.entries()) {
    byModel.push({
      model,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens,
      turns: acc.turns,
      estimatedCostUsd: acc.hasPricing ? acc.estimatedCostUsd : null,
    });
    totalInput += acc.inputTokens;
    totalOutput += acc.outputTokens;
    totalCacheRead += acc.cacheReadTokens;
    totalCacheWrite += acc.cacheWriteTokens;
    if (acc.hasPricing) totalCost += acc.estimatedCostUsd;
  }
  byModel.sort((a, b) => b.outputTokens - a.outputTokens);

  const byTool: ToolStats[] = [];
  for (const [tool, acc] of state.toolMap.entries()) {
    byTool.push({
      tool,
      calls: acc.calls,
      turns: acc.turnIds.size,
      inputTokens: Math.round(acc.inputTokens),
      outputTokens: Math.round(acc.outputTokens),
    });
  }
  byTool.sort((a, b) => b.outputTokens - a.outputTokens);

  const byToolModel: ToolModelStats[] = [];
  for (const [key, calls] of state.toolModelMap.entries()) {
    const sep = key.indexOf("|");
    const tool = key.slice(0, sep);
    const model = key.slice(sep + 1);
    byToolModel.push({ tool, model, calls });
  }
  byToolModel.sort((a, b) => {
    if (a.tool !== b.tool) return a.tool.localeCompare(b.tool);
    return a.model.localeCompare(b.model);
  });

  return {
    filters,
    sessionsScanned: state.sessionIds.size,
    turnsScanned: state.turnsScanned,
    malformedLinesSkipped,
    unpricedModels: Array.from(state.unpriced).sort(),
    earliestTimestamp: state.earliest,
    latestTimestamp: state.latest,
    byModel,
    byTool,
    byToolModel,
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      estimatedCostUsd: totalCost,
    },
  };
}
