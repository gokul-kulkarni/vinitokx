//! `vtkxoptm warm` — make the model hot in RAM so the first task is fast.
//! `vtkxoptm doctor` — diagnose ollama / llmfit / model availability.

use anyhow::Result;
use std::process::Command;
use std::time::Duration;

use crate::config;
use crate::ollama;

pub fn run() -> Result<()> {
    let cfg = match config::load() {
        Ok(c) => c,
        Err(_) => {
            // Plan: SessionStart hook must not block sessions.
            eprintln!("vtkxoptm: no config; run `vtkxoptm setup` first.");
            return Ok(());
        }
    };

    if !ollama::is_alive(&cfg.ollama_url) {
        eprintln!(
            "vtkxoptm: ollama not reachable at {}. start it with `ollama serve`.",
            cfg.ollama_url
        );
        return Ok(());
    }

    // Send a 1-token preload request. Ollama keeps the model resident for ~5min.
    let _ = ollama::generate(
        &cfg.ollama_url,
        &cfg.model,
        "ok",
        Some(crate::ollama::GenerateOptions {
            temperature: Some(0.0),
            num_predict: Some(1),
        }),
        Duration::from_secs(30),
    );
    Ok(())
}

pub fn doctor() -> Result<()> {
    let mut ok = true;

    print!("ollama:  ");
    match Command::new("ollama").arg("--version").output() {
        Ok(out) if out.status.success() => {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            println!("{v}");
        }
        _ => {
            println!("MISSING (install: https://ollama.com/download)");
            ok = false;
        }
    }

    print!("llmfit:  ");
    match Command::new("llmfit").arg("--version").output() {
        Ok(out) if out.status.success() => {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            println!("{v}");
        }
        _ => {
            println!("MISSING (install: brew install llmfit)");
            ok = false;
        }
    }

    print!("config:  ");
    match config::load() {
        Ok(cfg) => {
            println!("model={} url={}", cfg.model, cfg.ollama_url);

            print!("server:  ");
            if ollama::is_alive(&cfg.ollama_url) {
                println!("up");
            } else {
                println!("DOWN ({})", cfg.ollama_url);
                ok = false;
            }

            print!("model:   ");
            match Command::new("ollama").arg("list").output() {
                Ok(out) if out.status.success() => {
                    let listed = String::from_utf8_lossy(&out.stdout);
                    if listed.contains(&cfg.model) {
                        println!("present");
                    } else {
                        println!("NOT PULLED ({}). run `ollama pull {}`", cfg.model, cfg.model);
                        ok = false;
                    }
                }
                _ => {
                    println!("could not run `ollama list`");
                    ok = false;
                }
            }
        }
        Err(_) => {
            println!("MISSING (run `vtkxoptm setup`)");
            ok = false;
        }
    }

    if ok {
        Ok(())
    } else {
        anyhow::bail!("vtkxoptm: one or more checks failed")
    }
}
