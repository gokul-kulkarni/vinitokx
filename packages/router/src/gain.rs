//! `vtkxoptm gain` — render a compact savings dashboard from the JSONL ledger.

use anyhow::Result;
use std::collections::BTreeMap;

use crate::config;
use crate::savings::{self, Record};

pub fn run() -> Result<()> {
    let path = config::savings_path()?;
    let result = savings::read_all(&path)?;
    let report = build_report(&result.records);
    print!("{}", render(&report));
    if result.malformed > 0 {
        eprintln!(
            "vtkxoptm: {} malformed savings line(s) skipped",
            result.malformed
        );
    }
    Ok(())
}

#[derive(Debug, Default)]
pub struct Report {
    pub total_calls: u64,
    pub total_input_chars: u64,
    pub total_output_chars: u64,
    pub total_tokens_saved: u64,
    pub total_ms: u64,
    pub by_task: BTreeMap<String, TaskRow>,
}

#[derive(Debug, Default, Clone)]
pub struct TaskRow {
    pub calls: u64,
    pub tokens_saved: u64,
    pub avg_ms: u64,
}

pub fn build_report(records: &[Record]) -> Report {
    let mut report = Report::default();
    let mut sums: BTreeMap<String, (u64, u64, u64)> = BTreeMap::new(); // calls, tokens, ms
    for r in records {
        report.total_calls += 1;
        report.total_input_chars += r.input_chars;
        report.total_output_chars += r.output_chars;
        report.total_tokens_saved += r.est_tokens_saved;
        report.total_ms += r.ms;
        let entry = sums.entry(r.task.clone()).or_insert((0, 0, 0));
        entry.0 += 1;
        entry.1 += r.est_tokens_saved;
        entry.2 += r.ms;
    }
    for (task, (calls, tokens, ms)) in sums {
        report.by_task.insert(
            task,
            TaskRow {
                calls,
                tokens_saved: tokens,
                avg_ms: ms.checked_div(calls).unwrap_or(0),
            },
        );
    }
    report
}

pub fn render(report: &Report) -> String {
    let mut out = String::new();
    out.push_str("vtkxoptm Token Savings\n");
    out.push_str("================================================\n");
    out.push_str(&format!("Total calls:       {}\n", report.total_calls));
    out.push_str(&format!(
        "Tokens saved:      {}\n",
        report.total_tokens_saved
    ));
    out.push_str(&format!(
        "Input chars kept local:  {}\n",
        report.total_input_chars
    ));
    out.push_str(&format!(
        "Output chars produced:   {}\n",
        report.total_output_chars
    ));
    out.push_str(&format!("Total local time:  {}ms\n", report.total_ms));
    out.push_str("\nBy Task\n");
    out.push_str("------------------------------------------------\n");
    out.push_str("  Task          Calls   Tokens-saved   Avg(ms)\n");
    for (task, row) in &report.by_task {
        out.push_str(&format!(
            "  {:<12}  {:>5}   {:>12}   {:>7}\n",
            task, row.calls, row.tokens_saved, row.avg_ms
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(task: &str, input: u64, output: u64, ms: u64) -> Record {
        Record {
            ts: 0,
            task: task.into(),
            model: "test-model".into(),
            input_chars: input,
            output_chars: output,
            est_tokens_saved: super::savings::est_tokens_saved(input, output),
            ms,
        }
    }

    #[test]
    fn aggregates_per_task() {
        let records = vec![
            rec("summarize", 1000, 200, 1500),
            rec("summarize", 2000, 400, 2500),
            rec("classify", 80, 8, 200),
        ];
        let report = build_report(&records);
        assert_eq!(report.total_calls, 3);
        assert_eq!(report.by_task.len(), 2);
        assert_eq!(report.by_task["summarize"].calls, 2);
        assert_eq!(report.by_task["classify"].calls, 1);
        assert_eq!(report.by_task["summarize"].avg_ms, 2000);
    }

    #[test]
    fn render_includes_total_and_task_rows() {
        let report = build_report(&[
            rec("summarize", 1000, 200, 1500),
            rec("docstring", 200, 100, 600),
        ]);
        let text = render(&report);
        assert!(text.contains("Total calls:       2"));
        assert!(text.contains("summarize"));
        assert!(text.contains("docstring"));
    }
}
