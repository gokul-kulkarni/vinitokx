//! Append-only JSONL savings ledger.
//!
//! Mirrors the defensive parsing pattern from
//! `packages/observer/src/parser.ts`: malformed lines are counted, never
//! propagated as errors.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Heuristic char/4 token estimator. Source of truth lives in
/// `packages/core/src/tokenizer.ts` (`CHARS_PER_TOKEN`). Keep in sync.
pub const CHARS_PER_TOKEN: f64 = 4.0;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Record {
    pub ts: u64,
    pub task: String,
    pub model: String,
    pub input_chars: u64,
    pub output_chars: u64,
    pub est_tokens_saved: u64,
    pub ms: u64,
}

impl Record {
    pub fn new(
        task: impl Into<String>,
        model: impl Into<String>,
        input_chars: u64,
        output_chars: u64,
        ms: u64,
    ) -> Self {
        let saved = est_tokens_saved(input_chars, output_chars);
        Self {
            ts: now_secs(),
            task: task.into(),
            model: model.into(),
            input_chars,
            output_chars,
            est_tokens_saved: saved,
            ms,
        }
    }
}

pub fn est_tokens_saved(input_chars: u64, output_chars: u64) -> u64 {
    // Cloud cost we avoided ~= input cost (file body never traversed cloud LLM)
    // plus output cost (model produced answer locally).
    let total = input_chars.saturating_add(output_chars) as f64;
    (total / CHARS_PER_TOKEN).round() as u64
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn append(path: &Path, record: &Record) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("could not create savings dir {}", parent.display()))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("could not open savings file {}", path.display()))?;
    let line = serde_json::to_string(record).context("failed to serialise savings record")?;
    writeln!(file, "{}", line).context("failed to write savings record")?;
    Ok(())
}

#[derive(Debug, Default)]
pub struct ReadResult {
    pub records: Vec<Record>,
    pub malformed: u64,
}

pub fn read_all(path: &Path) -> Result<ReadResult> {
    let mut result = ReadResult::default();
    if !path.exists() {
        return Ok(result);
    }
    let file = std::fs::File::open(path)
        .with_context(|| format!("could not open savings file {}", path.display()))?;
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else {
            result.malformed += 1;
            continue;
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Record>(trimmed) {
            Ok(r) => result.records.push(r),
            Err(_) => result.malformed += 1,
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimator_uses_char_quarter() {
        // 1000 input + 200 output chars ~= 300 tokens
        assert_eq!(est_tokens_saved(1000, 200), 300);
    }

    #[test]
    fn round_trips_via_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("savings.jsonl");
        let r1 = Record::new("summarize", "llama3.2:latest", 800, 120, 1500);
        let r2 = Record::new("classify", "llama3.2:latest", 60, 12, 250);
        append(&path, &r1).unwrap();
        append(&path, &r2).unwrap();
        let result = read_all(&path).unwrap();
        assert_eq!(result.malformed, 0);
        assert_eq!(result.records.len(), 2);
        assert_eq!(result.records[0].task, "summarize");
        assert_eq!(result.records[1].task, "classify");
    }

    #[test]
    fn malformed_lines_are_counted_not_thrown() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("savings.jsonl");
        let valid = Record::new("docstring", "llama3.2:latest", 200, 80, 600);
        append(&path, &valid).unwrap();
        // Manually append a malformed line.
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        writeln!(f, "{{not valid json").unwrap();
        writeln!(f).unwrap(); // empty line (should be skipped silently)

        let result = read_all(&path).unwrap();
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.malformed, 1);
    }

    #[test]
    fn missing_file_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nope.jsonl");
        let result = read_all(&path).unwrap();
        assert_eq!(result.records.len(), 0);
        assert_eq!(result.malformed, 0);
    }
}
