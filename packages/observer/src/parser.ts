import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { AssistantRecord, TranscriptRecord, UsageBlock } from "./types.js";

export interface ParseStats {
  validLines: number;
  malformedLines: number;
}

export interface ParseResult {
  records: TranscriptRecord[];
  stats: ParseStats;
}

export async function* streamRecords(
  filePath: string
): AsyncGenerator<TranscriptRecord, ParseStats> {
  const stats: ParseStats = { validLines: 0, malformedLines: 0 };
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      stats.malformedLines += 1;
      continue;
    }
    if (!isObject(parsed) || typeof parsed["type"] !== "string") {
      stats.malformedLines += 1;
      continue;
    }
    stats.validLines += 1;
    yield parsed as TranscriptRecord;
  }

  return stats;
}

export function isAssistantRecord(r: TranscriptRecord): r is AssistantRecord {
  if (r.type !== "assistant") return false;
  const rec = r as Record<string, unknown>;
  const message = rec["message"];
  if (!isObject(message)) return false;
  if (typeof message["model"] !== "string") return false;
  if (!isObject(message["usage"])) return false;
  const usage = message["usage"] as Record<string, unknown>;
  if (typeof usage["input_tokens"] !== "number") return false;
  if (typeof usage["output_tokens"] !== "number") return false;
  if (!Array.isArray(message["content"])) return false;
  return true;
}

export function readUsage(record: AssistantRecord): UsageBlock {
  const u = record.message.usage;
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
