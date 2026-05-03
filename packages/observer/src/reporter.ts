import type { ModelStats, Report } from "./types.js";

const RULE = "─".repeat(60);

export function formatJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export function formatAscii(report: Report): string {
  const lines: string[] = [];

  const since = report.earliestTimestamp ? report.earliestTimestamp.slice(0, 10) : "—";
  const until = report.latestTimestamp ? report.latestTimestamp.slice(0, 10) : "—";

  lines.push(
    `ViniTokx Token Report — ${report.sessionsScanned} sessions, ${report.turnsScanned} turns, ${since} → ${until}`
  );
  lines.push("");

  if (report.byModel.length === 0) {
    lines.push("No assistant turns found in scope.");
    lines.push(scopeFooter(report));
    return lines.join("\n");
  }

  // By Model
  lines.push("By Model");
  lines.push(RULE);
  for (const m of report.byModel) {
    const cost =
      m.estimatedCostUsd === null
        ? "est. $—"
        : `est. $${m.estimatedCostUsd.toFixed(2)}`;
    lines.push(
      `${pad(m.model, 22)} input: ${num(m.inputTokens, 9)}  output: ${num(m.outputTokens, 9)}  cache_r: ${num(m.cacheReadTokens, 10)}  ${cost}`
    );
  }
  lines.push("");

  // By Tool
  lines.push("By Tool (turn-level approximation — see footer)");
  lines.push(RULE);
  if (report.byTool.length === 0) {
    lines.push("(no tool_use blocks recorded)");
  } else {
    for (const t of report.byTool) {
      const avg = t.calls > 0 ? Math.round(t.outputTokens / t.calls) : 0;
      lines.push(
        `${pad(t.tool, 18)} ${pad(`${t.calls} calls in ${t.turns} turns`, 24)} ~${num(t.outputTokens, 7)} output tokens   avg ${avg}/call`
      );
    }
  }
  lines.push("");

  // Tool × Model
  lines.push("Tool × Model");
  lines.push(RULE);
  if (report.byToolModel.length === 0) {
    lines.push("(no tool_use blocks recorded)");
  } else {
    for (const tm of report.byToolModel) {
      lines.push(`${pad(tm.tool, 18)} ${pad(tm.model, 22)} ${tm.calls} calls`);
    }
  }
  lines.push("");

  lines.push(footer(report));

  return lines.join("\n");
}

export function formatCompact(report: Report): string {
  const lines: string[] = [];
  const since = report.earliestTimestamp ? report.earliestTimestamp.slice(0, 10) : "—";
  const until = report.latestTimestamp ? report.latestTimestamp.slice(0, 10) : "—";

  const totalCost = report.totals.estimatedCostUsd;
  const grandTotal =
    report.totals.inputTokens +
    report.totals.outputTokens +
    report.totals.cacheReadTokens +
    report.totals.cacheWriteTokens;

  lines.push(
    `ViniTokx — ${report.sessionsScanned} sessions, ${report.turnsScanned} turns, ${since} → ${until}`
  );
  lines.push(
    `Total: ${grandTotal.toLocaleString("en-US")} tokens   est. $${totalCost.toFixed(2)}`
  );
  lines.push("");
  lines.push("Top Tools (turn-level approximation)");
  const top = report.byTool.slice(0, 5);
  if (top.length === 0) {
    lines.push("  (none)");
  } else {
    const maxOutput = Math.max(...top.map((t) => t.outputTokens), 1);
    for (const t of top) {
      const filled = Math.max(1, Math.round((t.outputTokens / maxOutput) * 16));
      const bar = "█".repeat(filled) + "░".repeat(16 - filled);
      lines.push(
        `  ${pad(t.tool, 14)} ${bar} ~${num(t.outputTokens, 7)} (${t.calls} calls)`
      );
    }
  }
  lines.push("");

  if (report.byModel.length === 0) {
    lines.push("Recommendation: no data — run `vinitokx analyze --all` to scan all projects.");
  } else {
    const topModel = report.byModel[0]!;
    const recommendation =
      totalCost > 5
        ? `Cost watch: $${totalCost.toFixed(2)} accumulated. Review high-token tools.`
        : `Healthy. Top model: ${topModel.model}.`;
    lines.push(`Recommendation: ${recommendation}`);
  }

  return lines.join("\n");
}

// All Claude models share the same pricing ratio: output=5x, cacheWrite=1.25x, cacheRead=0.1x (vs input).
// This lets us split a known total cost into per-type buckets without needing raw prices.
interface CostSplit {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
}

function costSplit(m: ModelStats): CostSplit | null {
  if (m.estimatedCostUsd === null) return null;
  const C = m.estimatedCostUsd;
  const units =
    m.inputTokens +
    5 * m.outputTokens +
    1.25 * m.cacheWriteTokens +
    0.1 * m.cacheReadTokens;
  if (units === 0) return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: C };
  const p = C / units;
  return {
    input: m.inputTokens * p,
    output: 5 * m.outputTokens * p,
    cacheWrite: 1.25 * m.cacheWriteTokens * p,
    cacheRead: 0.1 * m.cacheReadTokens * p,
    total: C,
  };
}

interface Insight {
  level: "warn" | "info" | "ok";
  title: string;
  body: string;
}

function deriveInsights(report: Report): Insight[] {
  const insights: Insight[] = [];
  const activeModels = report.byModel.filter((m) => m.turns > 2);

  // Expensive model usage
  const totalCost = report.totals.estimatedCostUsd;
  if (activeModels.length > 1 && totalCost > 0) {
    for (const m of activeModels) {
      if (m.estimatedCostUsd !== null && m.model.includes("opus")) {
        const frac = m.estimatedCostUsd / totalCost;
        if (frac > 0.5) {
          insights.push({
            level: "warn",
            title: `${esc(m.model)} is ${(frac * 100).toFixed(0)}% of total cost ($${m.estimatedCostUsd.toFixed(2)} of $${totalCost.toFixed(2)})`,
            body: "Opus is 5× more expensive per token than Sonnet. Route routine tasks (file edits, bash, read/write) to Sonnet and reserve Opus for complex architectural decisions.",
          });
        }
      }
    }
  }

  // Cache efficiency per model
  for (const m of activeModels) {
    const denom = m.inputTokens + m.cacheReadTokens;
    if (denom === 0) continue;
    const rate = m.cacheReadTokens / denom;
    if (rate < 0.5) {
      insights.push({
        level: rate < 0.25 ? "warn" : "info",
        title: `Low cache hit rate on ${esc(m.model)} (${(rate * 100).toFixed(0)}%)`,
        body: "Keep sessions longer, reduce CLAUDE.md file size, and avoid restarting Claude Code between related tasks to improve cache reuse.",
      });
    } else if (rate >= 0.8) {
      const s = costSplit(m);
      const savingsNote =
        s !== null
          ? ` Cache reads cost ~$${s.cacheRead.toFixed(2)} vs ~$${(s.cacheRead / 0.1).toFixed(2)} at full input price.`
          : "";
      insights.push({
        level: "ok",
        title: `Cache efficiency is excellent on ${esc(m.model)} (${(rate * 100).toFixed(0)}% hit rate)`,
        body: `Prompt caching is working well — cache reads cost 10× less than fresh input tokens.${savingsNote}`,
      });
    }
  }

  // Write vs Edit
  const writeTool = report.byTool.find((t) => t.tool === "Write");
  const editTool = report.byTool.find((t) => t.tool === "Edit");
  if (writeTool && writeTool.calls > 2) {
    const avgWrite = Math.round(writeTool.outputTokens / writeTool.calls);
    const editNote = editTool
      ? ` Edit averages ${Math.round(editTool.outputTokens / editTool.calls).toLocaleString("en-US")} tokens/call by contrast.`
      : "";
    insights.push({
      level: "info",
      title: `Write averages ${avgWrite.toLocaleString("en-US")} tokens/call (${writeTool.calls} calls)`,
      body: `Write echoes the entire file back. Prefer Edit for modifying existing files — it sends only the changed snippet and uses far fewer tokens.${editNote}`,
    });
  }

  // Most verbose tool (excluding Write which gets its own note)
  const verboseTools = [...report.byTool]
    .filter((t) => t.tool !== "Write" && t.calls >= 3)
    .sort((a, b) => b.outputTokens / b.calls - a.outputTokens / a.calls);
  const topVerbose = verboseTools[0];
  if (topVerbose) {
    const avg = Math.round(topVerbose.outputTokens / topVerbose.calls);
    if (avg > 800) {
      const action =
        topVerbose.tool === "Read"
          ? "Use offset and limit parameters to read only the relevant portion of large files."
          : topVerbose.tool === "Bash"
            ? "Pipe output through grep, head, or tail to return only the relevant lines."
            : "Consider whether full output is needed or if results can be filtered before returning.";
      insights.push({
        level: "info",
        title: `${esc(topVerbose.tool)} averages ${avg.toLocaleString("en-US")} output tokens/call`,
        body: action,
      });
    }
  }

  // Output cost dominance
  const splits = activeModels.map((m) => costSplit(m)).filter((s): s is CostSplit => s !== null);
  const outputCostTotal = splits.reduce((s, c) => s + c.output, 0);
  if (totalCost > 0 && outputCostTotal / totalCost > 0.3) {
    insights.push({
      level: "info",
      title: `Output tokens drive ${((outputCostTotal / totalCost) * 100).toFixed(0)}% of total cost`,
      body: "Output tokens cost 5× more than input despite being a smaller share of volume. Reduce verbosity: prefer concise responses and avoid asking Claude to enumerate exhaustively.",
    });
  }

  const order: Record<Insight["level"], number> = { warn: 0, info: 1, ok: 2 };
  return insights.sort((a, b) => order[a.level] - order[b.level]);
}

export function formatHtml(report: Report): string {
  const since = report.earliestTimestamp ? report.earliestTimestamp.slice(0, 10) : "—";
  const until = report.latestTimestamp ? report.latestTimestamp.slice(0, 10) : "—";
  const grandTotal =
    report.totals.inputTokens +
    report.totals.outputTokens +
    report.totals.cacheReadTokens +
    report.totals.cacheWriteTokens;
  const totalCost = report.totals.estimatedCostUsd;
  const generatedAt = new Date().toISOString();

  const maxOutputTokens = Math.max(...report.byTool.map((t) => t.outputTokens), 1);

  function cacheHitPct(m: ModelStats): string {
    const denom = m.inputTokens + m.cacheReadTokens;
    if (denom === 0) return "—";
    return `${((m.cacheReadTokens / denom) * 100).toFixed(0)}%`;
  }

  function outPerTurn(m: ModelStats): string {
    if (m.turns === 0) return "—";
    return Math.round(m.outputTokens / m.turns).toLocaleString("en-US");
  }

  function badgeClass(cost: number | null): string {
    if (cost === null) return "badge-grey";
    if (cost < 1) return "badge-green";
    if (cost < 5) return "badge-yellow";
    if (cost < 20) return "badge-orange";
    return "badge-red";
  }

  function badgeText(cost: number | null): string {
    return cost === null ? "est. $—" : `est. $${cost.toFixed(2)}`;
  }

  const modelRows = report.byModel
    .map(
      (m) => `
        <tr>
          <td>${esc(m.model)}</td>
          <td class="num">${m.inputTokens.toLocaleString("en-US")}</td>
          <td class="num">${m.outputTokens.toLocaleString("en-US")}</td>
          <td class="num">${m.cacheReadTokens.toLocaleString("en-US")}</td>
          <td class="num">${m.cacheWriteTokens.toLocaleString("en-US")}</td>
          <td class="num">${cacheHitPct(m)}</td>
          <td class="num">${outPerTurn(m)}</td>
          <td><span class="badge ${badgeClass(m.estimatedCostUsd)}">${badgeText(m.estimatedCostUsd)}</span></td>
        </tr>`
    )
    .join("");

  const toolRows = report.byTool
    .map((t) => {
      const pct = Math.min(100, Math.round((t.outputTokens / maxOutputTokens) * 100));
      const avg = t.calls > 0 ? Math.round(t.outputTokens / t.calls) : 0;
      return `
        <tr>
          <td>${esc(t.tool)}</td>
          <td>
            <div class="bar-wrap"><div class="bar" style="width:${pct}%"></div></div>
          </td>
          <td class="num">~${t.outputTokens.toLocaleString("en-US")}</td>
          <td class="num">${t.calls}</td>
          <td class="num">${t.turns}</td>
          <td class="num">${avg}</td>
        </tr>`;
    })
    .join("");

  const toolModelRows = report.byToolModel
    .map(
      (tm) => `
        <tr>
          <td>${esc(tm.tool)}</td>
          <td>${esc(tm.model)}</td>
          <td class="num">${tm.calls}</td>
        </tr>`
    )
    .join("");

  const costRows = report.byModel
    .filter((m) => m.estimatedCostUsd !== null && m.turns > 0)
    .map((m) => {
      const s = costSplit(m)!;
      const total = s.input + s.output + s.cacheWrite + s.cacheRead;
      if (total === 0) return "";
      const pInput = (s.input / total) * 100;
      const pOutput = (s.output / total) * 100;
      const pCW = (s.cacheWrite / total) * 100;
      const pCR = (s.cacheRead / total) * 100;
      return `
        <div class="cost-row">
          <div class="cost-model" title="${esc(m.model)}">${esc(m.model)}</div>
          <div class="cost-bar-wrap">
            <div class="cost-seg seg-input"  style="width:${pInput.toFixed(1)}%" title="Input $${s.input.toFixed(2)}"></div>
            <div class="cost-seg seg-output" style="width:${pOutput.toFixed(1)}%" title="Output $${s.output.toFixed(2)}"></div>
            <div class="cost-seg seg-cw"     style="width:${pCW.toFixed(1)}%"    title="Cache Write $${s.cacheWrite.toFixed(2)}"></div>
            <div class="cost-seg seg-cr"     style="width:${pCR.toFixed(1)}%"    title="Cache Read $${s.cacheRead.toFixed(2)}"></div>
          </div>
          <div class="cost-labels">
            <span class="cl cl-input">Input $${s.input.toFixed(2)}</span>
            <span class="cl cl-output">Output $${s.output.toFixed(2)}</span>
            <span class="cl cl-cw">Cache Write $${s.cacheWrite.toFixed(2)}</span>
            <span class="cl cl-cr">Cache Read $${s.cacheRead.toFixed(2)}</span>
          </div>
          <div class="cost-total">$${total.toFixed(2)}</div>
        </div>`;
    })
    .join("");

  const insights = deriveInsights(report);
  const insightItems = insights
    .map(
      (ins) => `
        <div class="insight ${ins.level}">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-body">${ins.body}</div>
        </div>`
    )
    .join("");

  const footerText = [
    "Per-tool token figures are turn-level approximations.",
    report.unpricedModels.length > 0
      ? `${report.unpricedModels.length} unpriced model(s): ${esc(report.unpricedModels.join(", "))}.`
      : "0 unpriced models.",
    `${report.malformedLinesSkipped} malformed line(s) skipped.`,
  ].join(" ");

  const scopeLabel =
    report.filters.scope === "all"
      ? "all projects"
      : report.filters.scope === "explicit-project"
        ? `project: ${esc(report.filters.projectPath ?? "?")}`
        : `current project: ${esc(report.filters.projectPath ?? "?")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ViniTokx Token Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #c9d1d9; }
    .wrap { max-width: 960px; margin: 2rem auto; padding: 0 1.25rem; }
    .header { margin-bottom: 2rem; }
    .header h1 { font-size: 1.5rem; color: #e6edf3; margin-bottom: .25rem; }
    .header .sub { color: #6e7681; font-size: .875rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1rem 1.25rem; }
    .card .label { font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: #6e7681; margin-bottom: .25rem; }
    .card .value { font-size: 1.5rem; font-weight: 700; color: #e6edf3; font-family: monospace; }
    section { margin-bottom: 2.5rem; }
    section h2 { font-size: 1rem; font-weight: 600; color: #e6edf3; padding-bottom: .5rem; border-bottom: 2px solid #21262d; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    thead th { background: #161b22; color: #8b949e; padding: .6rem .75rem; text-align: left; font-weight: 600; position: sticky; top: 0; border-bottom: 1px solid #30363d; }
    thead th.num { text-align: right; }
    tbody td { padding: .55rem .75rem; border-bottom: 1px solid #21262d; vertical-align: middle; color: #c9d1d9; }
    tbody tr:nth-child(even) td { background: #161b22; }
    tbody tr:hover td { background: #1c2128; }
    td.num { text-align: right; font-family: monospace; }
    .bar-wrap { width: 160px; height: 10px; background: #21262d; border-radius: 5px; overflow: hidden; display: inline-block; vertical-align: middle; }
    .bar { height: 100%; background: #7c3aed; border-radius: 5px; }
    .badge { display: inline-block; padding: .2em .6em; border-radius: 4px; font-size: .8rem; font-family: monospace; font-weight: 600; }
    .badge-grey   { background: #21262d; color: #6e7681; }
    .badge-green  { background: #0d2b1e; color: #3fb950; }
    .badge-yellow { background: #2b1f0a; color: #d29922; }
    .badge-orange { background: #2b1400; color: #f0883e; }
    .badge-red    { background: #2b0a0a; color: #f85149; }
    .footer { font-size: .8rem; color: #6e7681; border-top: 1px solid #21262d; padding-top: 1rem; margin-top: 1rem; }
    .cost-row { display: flex; align-items: center; gap: .75rem; margin-bottom: .65rem; font-size: .875rem; }
    .cost-model { width: 190px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c9d1d9; flex-shrink: 0; }
    .cost-bar-wrap { flex: 1; height: 18px; background: #21262d; border-radius: 4px; overflow: hidden; display: flex; min-width: 0; }
    .cost-seg { height: 100%; }
    .seg-input  { background: #388bfd; }
    .seg-output { background: #7c3aed; }
    .seg-cw     { background: #d29922; }
    .seg-cr     { background: #3fb950; }
    .cost-labels { display: flex; gap: .5rem; flex-wrap: wrap; width: 380px; flex-shrink: 0; }
    .cl { font-size: .75rem; font-family: monospace; padding: .1em .4em; border-radius: 3px; }
    .cl-input  { background: #0d2147; color: #388bfd; }
    .cl-output { background: #1a0b3b; color: #a78bfa; }
    .cl-cw     { background: #2b1f0a; color: #d29922; }
    .cl-cr     { background: #0d2b1e; color: #3fb950; }
    .cost-total { width: 64px; text-align: right; font-family: monospace; color: #8b949e; flex-shrink: 0; }
    .legend { display: flex; gap: 1.25rem; margin-bottom: .875rem; flex-wrap: wrap; font-size: .8rem; }
    .legend-item { display: flex; align-items: center; gap: .35rem; color: #8b949e; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .insights-list { display: flex; flex-direction: column; gap: .625rem; }
    .insight { background: #161b22; border: 1px solid #30363d; border-left: 4px solid; border-radius: 6px; padding: .875rem 1rem; }
    .insight.warn { border-left-color: #f85149; }
    .insight.info { border-left-color: #388bfd; }
    .insight.ok   { border-left-color: #3fb950; }
    .insight-title { font-weight: 600; color: #e6edf3; margin-bottom: .3rem; font-size: .875rem; }
    .insight-body  { color: #8b949e; font-size: .825rem; line-height: 1.55; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>ViniTokx Token Report</h1>
      <div class="sub">${esc(since)} → ${esc(until)} &nbsp;·&nbsp; scope: ${scopeLabel} &nbsp;·&nbsp; generated ${esc(generatedAt)}</div>
    </div>
    <div class="summary-grid">
      <div class="card"><div class="label">Sessions</div><div class="value">${report.sessionsScanned}</div></div>
      <div class="card"><div class="label">Turns</div><div class="value">${report.turnsScanned}</div></div>
      <div class="card"><div class="label">Total Tokens</div><div class="value">${grandTotal.toLocaleString("en-US")}</div></div>
      <div class="card"><div class="label">Est. Cost</div><div class="value">$${totalCost.toFixed(2)}</div></div>
    </div>
    ${
      costRows
        ? `<section>
      <h2>Cost Breakdown by Token Type</h2>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#388bfd"></div>Input</div>
        <div class="legend-item"><div class="legend-dot" style="background:#7c3aed"></div>Output</div>
        <div class="legend-item"><div class="legend-dot" style="background:#d29922"></div>Cache Write</div>
        <div class="legend-item"><div class="legend-dot" style="background:#3fb950"></div>Cache Read</div>
      </div>
      ${costRows}
    </section>`
        : ""
    }
    <section>
      <h2>By Model</h2>
      ${
        report.byModel.length === 0
          ? "<p>No assistant turns found in scope.</p>"
          : `<table>
        <thead><tr>
          <th>Model</th>
          <th class="num">Input</th>
          <th class="num">Output</th>
          <th class="num">Cache Read</th>
          <th class="num">Cache Write</th>
          <th class="num">Cache Hit</th>
          <th class="num">Out/Turn</th>
          <th>Cost</th>
        </tr></thead>
        <tbody>${modelRows}</tbody>
      </table>`
      }
    </section>
    <section>
      <h2>By Tool <span style="font-weight:400;font-size:.85em;color:#6e7681">(turn-level approximation)</span></h2>
      ${
        report.byTool.length === 0
          ? "<p>No tool_use blocks recorded.</p>"
          : `<table>
        <thead><tr>
          <th>Tool</th>
          <th>Output tokens</th>
          <th class="num">~Output</th>
          <th class="num">Calls</th>
          <th class="num">Turns</th>
          <th class="num">Avg/call</th>
        </tr></thead>
        <tbody>${toolRows}</tbody>
      </table>`
      }
    </section>
    <section>
      <h2>Tool × Model</h2>
      ${
        report.byToolModel.length === 0
          ? "<p>No tool_use blocks recorded.</p>"
          : `<table>
        <thead><tr>
          <th>Tool</th>
          <th>Model</th>
          <th class="num">Calls</th>
        </tr></thead>
        <tbody>${toolModelRows}</tbody>
      </table>`
      }
    </section>
    ${
      insights.length > 0
        ? `<section>
      <h2>Optimization Insights</h2>
      <div class="insights-list">${insightItems}</div>
    </section>`
        : ""
    }
    <div class="footer">${footerText}</div>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function num(n: number, width: number): string {
  const s = n.toLocaleString("en-US");
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function scopeFooter(report: Report): string {
  return `— scope: ${describeScope(report)} | malformed lines skipped: ${report.malformedLinesSkipped}`;
}

function footer(report: Report): string {
  const parts = ["Per-tool figures are turn-level approximations."];
  if (report.unpricedModels.length > 0) {
    parts.push(`${report.unpricedModels.length} unpriced model(s): ${report.unpricedModels.join(", ")}.`);
  } else {
    parts.push("0 unpriced models.");
  }
  parts.push(`${report.malformedLinesSkipped} malformed line(s) skipped.`);
  parts.push(`scope: ${describeScope(report)}.`);
  return `— ${parts.join(" ")}`;
}

function describeScope(report: Report): string {
  switch (report.filters.scope) {
    case "all":
      return "all projects";
    case "explicit-project":
      return `project ${report.filters.projectPath ?? "?"}`;
    case "current-project":
      return `current project (${report.filters.projectPath ?? "?"})`;
  }
}
