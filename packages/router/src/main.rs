use anyhow::Result;
use clap::{Parser, Subcommand};

mod config;
mod gain;
mod ollama;
mod run;
mod savings;
mod setup;
mod tasks;
mod warm;

#[derive(Parser)]
#[command(
    name = "vtkxoptm",
    version,
    about = "Route small LLM tasks to a local Ollama model to save cloud tokens."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// One-time interactive setup: pick model via `llmfit`, pull via `ollama`.
    Setup,
    /// Ensure Ollama is running and the chosen model is preloaded into RAM.
    Warm,
    /// Run a single task against the local model and print the result on stdout.
    Run(run::RunArgs),
    /// Show savings ledger: tokens kept out of the cloud, by task and total.
    Gain,
    /// Diagnose missing dependencies, model, or config.
    Doctor,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Setup => setup::run(),
        Command::Warm => warm::run(),
        Command::Run(args) => run::run(args),
        Command::Gain => gain::run(),
        Command::Doctor => warm::doctor(),
    }
}
