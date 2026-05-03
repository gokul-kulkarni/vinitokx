//! `vtkxoptm setup` — interactive: detect available memory via `llmfit`,
//! pick an Ollama-pullable coding model that fits, run `ollama pull`,
//! persist `~/.config/vinitokx/router.toml`.
//!
//! Why we don't use llmfit's model names directly: llmfit returns
//! HuggingFace-style identifiers (e.g.
//! `RedHatAI/DeepSeek-Coder-V2-Lite-Instruct-FP8`) and supports MLX/llamacpp
//! runtimes. `ollama pull` needs Ollama-style tags
//! (e.g. `qwen2.5-coder:7b`). For v1 we use llmfit only for hardware
//! detection and pick from a curated Ollama list. Future work: translate
//! HF names to Ollama tags automatically.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::io::{self, BufRead, Write};
use std::process::{Command, Stdio};

use crate::config::{self, Config};

#[derive(Debug, Clone, Copy)]
struct OllamaCandidate {
    /// Tag passed to `ollama pull`.
    tag: &'static str,
    /// Approximate disk/RAM footprint at default quantization.
    size_gb: f32,
    /// One-line description.
    blurb: &'static str,
}

const CANDIDATES: &[OllamaCandidate] = &[
    OllamaCandidate {
        tag: "qwen2.5-coder:1.5b",
        size_gb: 1.6,
        blurb: "Tiny, fast — fine for classify and short docstrings on weak hardware",
    },
    OllamaCandidate {
        tag: "llama3.2:latest",
        size_gb: 2.0,
        blurb: "General-purpose 3B; balanced; already pulled on most systems",
    },
    OllamaCandidate {
        tag: "qwen2.5-coder:7b",
        size_gb: 4.7,
        blurb: "Recommended default for coding tasks on \u{2265}8 GB RAM",
    },
    OllamaCandidate {
        tag: "qwen2.5-coder:14b",
        size_gb: 9.0,
        blurb: "Stronger summaries and boilerplate; needs \u{2265}16 GB RAM",
    },
    OllamaCandidate {
        tag: "qwen2.5-coder:32b",
        size_gb: 20.0,
        blurb: "Best quality; only run on \u{2265}32 GB RAM with GPU/Metal",
    },
];

#[derive(Debug, Deserialize)]
struct LlmfitOutput {
    #[serde(default)]
    models: Vec<LlmfitModel>,
}

#[derive(Debug, Deserialize, Clone)]
struct LlmfitModel {
    #[serde(default)]
    memory_available_gb: Option<f32>,
}

pub fn run() -> Result<()> {
    require_binary("ollama", "https://ollama.com/download")?;

    let memory_gb = detect_memory_via_llmfit().unwrap_or_else(|err| {
        eprintln!(
            "vtkxoptm: llmfit unavailable ({err}); falling back to no-memory-fit hint."
        );
        0.0
    });

    if memory_gb > 0.0 {
        println!(
            "vtkxoptm setup: detected {memory_gb:.1} GB available memory.\n"
        );
    } else {
        println!("vtkxoptm setup: could not detect memory; pick conservatively.\n");
    }

    let usable = if memory_gb > 0.0 {
        memory_gb * 0.7 // leave headroom for OS + other apps
    } else {
        f32::INFINITY
    };

    println!("Pick an Ollama coding model:");
    for (i, c) in CANDIDATES.iter().enumerate() {
        let fit = if c.size_gb <= usable {
            "fits"
        } else {
            "may not fit"
        };
        println!(
            "  {}. {:<22} (~{:.1} GB, {})  \u{2014} {}",
            i + 1,
            c.tag,
            c.size_gb,
            fit,
            c.blurb
        );
    }

    let default_idx = pick_default(usable);
    print!(
        "\nPick [1-{}] (default {}): ",
        CANDIDATES.len(),
        default_idx + 1
    );
    io::stdout().flush().ok();
    let mut line = String::new();
    io::stdin()
        .lock()
        .read_line(&mut line)
        .context("failed to read selection")?;
    let idx: usize = match line.trim() {
        "" => default_idx,
        s => s.parse::<usize>().context("not a number")?.saturating_sub(1),
    };
    let chosen = CANDIDATES
        .get(idx)
        .ok_or_else(|| anyhow!("selection out of range"))?;

    println!("\nPulling `{}` via ollama\u{2026}", chosen.tag);
    let status = Command::new("ollama")
        .arg("pull")
        .arg(chosen.tag)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .context("failed to run `ollama pull`")?;
    if !status.success() {
        return Err(anyhow!("ollama pull failed"));
    }

    let cfg = Config::new(chosen.tag.to_string());
    config::save(&cfg)?;
    println!(
        "\nSaved {} -> model={}",
        config::config_path()?.display(),
        cfg.model
    );
    println!("Verify: `vtkxoptm warm && vtkxoptm doctor`");
    Ok(())
}

fn pick_default(usable: f32) -> usize {
    if usable.is_infinite() {
        // qwen2.5-coder:7b — sensible middle default when memory is unknown
        return 2;
    }
    let mut best: usize = 0;
    for (i, c) in CANDIDATES.iter().enumerate() {
        if c.size_gb <= usable {
            best = i;
        }
    }
    best
}

fn detect_memory_via_llmfit() -> Result<f32> {
    if Command::new("llmfit")
        .arg("--version")
        .output()
        .map(|o| !o.status.success())
        .unwrap_or(true)
    {
        return Err(anyhow!("`llmfit` not found (install: brew install llmfit)"));
    }

    let output = Command::new("llmfit")
        .arg("recommend")
        .arg("--use-case")
        .arg("coding")
        .arg("--limit")
        .arg("1")
        .output()
        .context("failed to run `llmfit recommend`")?;

    if !output.status.success() {
        return Err(anyhow!(
            "llmfit failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: LlmfitOutput =
        serde_json::from_str(&stdout).context("llmfit output not in expected JSON shape")?;
    parsed
        .models
        .first()
        .and_then(|m| m.memory_available_gb)
        .ok_or_else(|| anyhow!("llmfit returned no memory_available_gb"))
}

fn require_binary(name: &str, install_hint: &str) -> Result<()> {
    if Command::new(name)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        Ok(())
    } else {
        Err(anyhow!("`{}` not found. install: {}", name, install_hint))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_default_returns_largest_fitting_index() {
        // 5 GB usable -> qwen2.5-coder:7b (4.7 GB) fits but :14b (9 GB) doesn't.
        // Index of qwen2.5-coder:7b in CANDIDATES is 2.
        assert_eq!(pick_default(5.0), 2);
    }

    #[test]
    fn pick_default_when_memory_unknown_returns_middle() {
        assert_eq!(pick_default(f32::INFINITY), 2);
    }

    #[test]
    fn pick_default_low_memory_returns_smallest() {
        assert_eq!(pick_default(1.0), 0); // only :1.5b at 1.6 GB doesn't fit, return 0 anyway
    }

    #[test]
    fn pick_default_high_memory_returns_largest() {
        assert_eq!(pick_default(64.0), CANDIDATES.len() - 1);
    }
}
