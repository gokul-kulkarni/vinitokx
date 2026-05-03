//! `vtkxoptm run` — read an input (file or stdin), call the local model,
//! print the post-processed result on stdout, append a savings record.

use anyhow::{Context, Result};
use clap::Args;
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::config;
use crate::ollama;
use crate::savings::{self, Record};
use crate::tasks::Task;

const RUN_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Args)]
pub struct RunArgs {
    /// Task to run: summarize | docstring | classify | boilerplate
    #[arg(long)]
    pub task: String,
    /// Path to a file whose contents become the model input.
    #[arg(long, conflicts_with = "input")]
    pub file: Option<PathBuf>,
    /// Inline input. Use `-` to read from stdin.
    #[arg(long)]
    pub input: Option<String>,
    /// Override the model in `router.toml` (advanced).
    #[arg(long)]
    pub model: Option<String>,
}

pub fn run(args: RunArgs) -> Result<()> {
    let task: Task = args.task.parse()?;
    let cfg = config::load()?;
    let model = args.model.clone().unwrap_or_else(|| cfg.model.clone());
    let input = read_input(&args)?;

    let prompt = task.build_prompt(&input);
    let started = Instant::now();
    let raw = ollama::generate(
        &cfg.ollama_url,
        &model,
        &prompt,
        task.options(),
        Duration::from_secs(RUN_TIMEOUT_SECS),
    )?;
    let ms = started.elapsed().as_millis() as u64;
    let result = task.postprocess(&raw);

    println!("{}", result);

    let record = Record::new(
        task.as_str(),
        &model,
        input.len() as u64,
        result.len() as u64,
        ms,
    );
    let savings_path = config::savings_path()?;
    if let Err(e) = savings::append(&savings_path, &record) {
        eprintln!("vtkxoptm: failed to write savings record: {e:#}");
    }
    Ok(())
}

fn read_input(args: &RunArgs) -> Result<String> {
    if let Some(path) = &args.file {
        return std::fs::read_to_string(path)
            .with_context(|| format!("could not read {}", path.display()));
    }
    if let Some(inline) = &args.input {
        if inline == "-" {
            let mut buf = String::new();
            std::io::stdin()
                .read_to_string(&mut buf)
                .context("could not read stdin")?;
            return Ok(buf);
        }
        return Ok(inline.clone());
    }
    anyhow::bail!("no input: pass --file <PATH> or --input <TEXT|-> ");
}
