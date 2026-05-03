//! Persistent config at `~/.config/vinitokx/router.toml`.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";
pub const CONFIG_DIR_NAME: &str = "vinitokx";
pub const CONFIG_FILE_NAME: &str = "router.toml";
pub const SAVINGS_FILE_NAME: &str = "router-savings.jsonl";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    pub model: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default = "default_version")]
    pub version: u32,
}

fn default_ollama_url() -> String {
    DEFAULT_OLLAMA_URL.to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_version() -> u32 {
    1
}

impl Config {
    pub fn new(model: impl Into<String>) -> Self {
        Self {
            model: model.into(),
            ollama_url: default_ollama_url(),
            log_level: default_log_level(),
            version: default_version(),
        }
    }
}

pub fn config_dir() -> Result<PathBuf> {
    // Prefer XDG-style on every platform (including macOS) so the CLI
    // matches the location documented in the plan and what most Unix
    // developers expect.
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return Ok(PathBuf::from(xdg).join(CONFIG_DIR_NAME));
        }
    }
    let home = dirs::home_dir().context("could not locate home directory")?;
    Ok(home.join(".config").join(CONFIG_DIR_NAME))
}

pub fn config_path() -> Result<PathBuf> {
    Ok(config_dir()?.join(CONFIG_FILE_NAME))
}

pub fn savings_path() -> Result<PathBuf> {
    Ok(config_dir()?.join(SAVINGS_FILE_NAME))
}

pub fn load() -> Result<Config> {
    let path = config_path()?;
    let raw = std::fs::read_to_string(&path).with_context(|| {
        format!(
            "could not read config at {} \u{2014} run `vtkxoptm setup` first",
            path.display()
        )
    })?;
    parse(&raw)
}

pub fn parse(raw: &str) -> Result<Config> {
    toml::from_str::<Config>(raw).context("config file is not valid TOML")
}

pub fn save(config: &Config) -> Result<()> {
    let dir = config_dir()?;
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("could not create config dir {}", dir.display()))?;
    let raw = toml::to_string_pretty(config).context("failed to serialise config")?;
    std::fs::write(config_path()?, raw).context("failed to write config file")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_config() {
        let raw = r#"model = "qwen2.5-coder:7b""#;
        let cfg = parse(raw).unwrap();
        assert_eq!(cfg.model, "qwen2.5-coder:7b");
        assert_eq!(cfg.ollama_url, DEFAULT_OLLAMA_URL);
        assert_eq!(cfg.log_level, "info");
        assert_eq!(cfg.version, 1);
    }

    #[test]
    fn parses_full_config() {
        let raw = r#"
            model = "llama3.2:latest"
            ollama_url = "http://localhost:9999"
            log_level = "debug"
            version = 2
        "#;
        let cfg = parse(raw).unwrap();
        assert_eq!(cfg.model, "llama3.2:latest");
        assert_eq!(cfg.ollama_url, "http://localhost:9999");
        assert_eq!(cfg.log_level, "debug");
        assert_eq!(cfg.version, 2);
    }

    #[test]
    fn rejects_missing_model() {
        let raw = r#"ollama_url = "http://localhost:11434""#;
        assert!(parse(raw).is_err());
    }

    #[test]
    fn round_trips() {
        let cfg = Config::new("llama3.2:latest");
        let raw = toml::to_string_pretty(&cfg).unwrap();
        let parsed = parse(&raw).unwrap();
        assert_eq!(parsed, cfg);
    }
}
