import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { ModelPrice, UsageBlock } from "./types.js";

// USD per 1,000,000 tokens (input / output / cache-read / cache-write).
// User overrides via ~/.vinitokx/pricing.json (shallow merge).
const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "claude-opus-4-7":   { input: 15.0, output: 75.0, cacheRead: 1.5,  cacheWrite: 18.75 },
  "claude-opus-4-6":   { input: 15.0, output: 75.0, cacheRead: 1.5,  cacheWrite: 18.75 },
  "claude-sonnet-4-6": { input:  3.0, output: 15.0, cacheRead: 0.3,  cacheWrite:  3.75 },
  "claude-sonnet-4-5": { input:  3.0, output: 15.0, cacheRead: 0.3,  cacheWrite:  3.75 },
  "claude-haiku-4-5":  { input:  1.0, output:  5.0, cacheRead: 0.1,  cacheWrite:  1.25 },
};

export async function loadPrices(): Promise<Record<string, ModelPrice>> {
  const overridePath = join(homedir(), ".vinitokx", "pricing.json");
  let override: unknown;
  try {
    const raw = await readFile(overridePath, "utf8");
    override = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PRICES };
  }
  if (typeof override !== "object" || override === null) {
    return { ...DEFAULT_PRICES };
  }
  const merged: Record<string, ModelPrice> = { ...DEFAULT_PRICES };
  for (const [model, price] of Object.entries(override as Record<string, unknown>)) {
    if (isValidPrice(price)) {
      merged[model] = price;
    }
  }
  return merged;
}

export function priceFor(
  model: string,
  usage: UsageBlock,
  prices: Record<string, ModelPrice>
): number | null {
  const p = prices[model];
  if (!p) return null;
  const million = 1_000_000;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    million
  );
}

function isValidPrice(v: unknown): v is ModelPrice {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["input"] === "number" &&
    typeof o["output"] === "number" &&
    typeof o["cacheRead"] === "number" &&
    typeof o["cacheWrite"] === "number"
  );
}
