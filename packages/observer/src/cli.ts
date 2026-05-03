#!/usr/bin/env node
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  listProjectDirs,
  listSessionFiles,
  resolveProjectDir,
} from "./paths.js";
import { isAssistantRecord, streamRecords } from "./parser.js";
import { createState, ingestRecord, buildReport } from "./aggregator.js";
import { loadPrices } from "./pricing.js";
import { formatAscii, formatCompact, formatHtml, formatJson } from "./reporter.js";
import type { ReportFilters } from "./types.js";

const VERSION = "0.1.0";

interface ParsedArgs {
  subcommand: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const args = argv.slice(2);
  let subcommand = args[0] ?? "";
  let i = subcommand && !subcommand.startsWith("-") ? 1 : 0;
  if (i === 0) subcommand = "";

  while (i < args.length) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
    i += 1;
  }
  return { subcommand, flags, positional };
}

function printHelp(): void {
  console.log(`vinitokx ${VERSION}

Usage:
  vinitokx analyze [flags]    Show token consumption from local Claude Code transcripts.
  vinitokx hook                Read one JSON record on stdin, append to ~/.vinitokx/events.jsonl.
  vinitokx watch               (not yet implemented)
  vinitokx --help              Show this help.
  vinitokx --version           Print version.

analyze flags:
  --all                  Scan all project transcripts (default: current project only).
  --project <path>       Use the given path's transcripts.
  --session <uuid>       Filter to a single session id.
  --since <ISO>          Only include records with timestamp >= ISO.
  --until <ISO>          Only include records with timestamp <= ISO.
  --json                 Print machine-readable JSON.
  --compact              Print a single-screen dashboard.
  --html                 Print a self-contained HTML report.
  --output <file>        Write output to a file instead of stdout.

Examples:
  vinitokx analyze
  vinitokx analyze --all --json
  vinitokx analyze --since 2026-04-01 --compact
`);
}

async function runAnalyze(flags: Record<string, string | boolean>): Promise<number> {
  const sessionFilter = typeof flags["session"] === "string" ? flags["session"] : undefined;
  const since = typeof flags["since"] === "string" ? flags["since"] : undefined;
  const until = typeof flags["until"] === "string" ? flags["until"] : undefined;
  const all = flags["all"] === true;
  const explicitProject = typeof flags["project"] === "string" ? flags["project"] : undefined;

  let filters: ReportFilters;
  let filePaths: string[] = [];

  if (all) {
    filters = { scope: "all" };
    const dirs = await listProjectDirs();
    for (const d of dirs) {
      filePaths.push(...(await listSessionFiles(d.path)));
    }
  } else if (explicitProject) {
    filters = { scope: "explicit-project", projectPath: explicitProject };
    const dir = await resolveProjectDir(explicitProject);
    if (!dir) {
      console.error(`No transcripts found for project: ${explicitProject}`);
      return 1;
    }
    filePaths = await listSessionFiles(dir.path);
  } else {
    const cwd = process.cwd();
    filters = { scope: "current-project", projectPath: cwd };
    const dir = await resolveProjectDir(cwd);
    if (!dir) {
      console.error(
        `No transcripts found for current project: ${cwd}\nTry --all to scan every project.`
      );
      return 1;
    }
    filePaths = await listSessionFiles(dir.path);
  }

  if (sessionFilter) {
    filters.sessionId = sessionFilter;
    filePaths = filePaths.filter((p) => p.endsWith(`${sessionFilter}.jsonl`));
    if (filePaths.length === 0) {
      console.error(`No transcript file matches session id: ${sessionFilter}`);
      return 1;
    }
  }
  if (since) filters.since = since;
  if (until) filters.until = until;

  const prices = await loadPrices();
  const state = createState();
  let malformed = 0;

  for (const file of filePaths) {
    const iter = streamRecords(file);
    while (true) {
      const next = await iter.next();
      if (next.done) {
        if (next.value) malformed += next.value.malformedLines;
        break;
      }
      const record = next.value;
      if (!isAssistantRecord(record)) continue;

      if (since && record.timestamp < since) continue;
      if (until && record.timestamp > until) continue;
      if (sessionFilter && record.sessionId !== sessionFilter) continue;

      ingestRecord(state, record, prices);
    }
  }

  const report = buildReport(state, filters, malformed);

  let result: string;
  if (flags["json"] === true) {
    result = formatJson(report);
  } else if (flags["html"] === true) {
    result = formatHtml(report);
  } else if (flags["compact"] === true) {
    result = formatCompact(report);
  } else {
    result = formatAscii(report);
  }

  const outputFile = typeof flags["output"] === "string" ? flags["output"] : undefined;
  if (outputFile) {
    await writeFile(outputFile, result, "utf8");
    process.stderr.write(`Wrote report to ${outputFile}\n`);
  } else {
    console.log(result);
  }
  return 0;
}

async function runHook(): Promise<number> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0; // never block Claude Code
  }
  const line = JSON.stringify({
    receivedAt: new Date().toISOString(),
    event: parsed,
  });

  const logPath = join(homedir(), ".vinitokx", "events.jsonl");
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, line + "\n", "utf8");
  } catch {
    // silently swallow — never block Claude Code
  }
  return 0;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);

  if (parsed.flags["help"] === true || parsed.subcommand === "help") {
    printHelp();
    return 0;
  }
  if (parsed.flags["version"] === true) {
    console.log(VERSION);
    return 0;
  }

  switch (parsed.subcommand) {
    case "":
      printHelp();
      return 0;
    case "analyze":
      return runAnalyze(parsed.flags);
    case "hook":
      return runHook();
    case "watch":
      console.error("vinitokx watch: not yet implemented.");
      return 2;
    default:
      console.error(`Unknown subcommand: ${parsed.subcommand}`);
      printHelp();
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
);
