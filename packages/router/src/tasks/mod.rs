//! Task modules: each owns a prompt template and an output post-processor.
//!
//! Per the v1 plan, these four are routed to the local Ollama model:
//! summarize, docstring, classify, boilerplate.

use anyhow::{anyhow, Result};
use std::str::FromStr;

pub mod boilerplate;
pub mod classify;
pub mod docstring;
pub mod summarize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Task {
    Summarize,
    Docstring,
    Classify,
    Boilerplate,
}

impl Task {
    pub fn as_str(self) -> &'static str {
        match self {
            Task::Summarize => "summarize",
            Task::Docstring => "docstring",
            Task::Classify => "classify",
            Task::Boilerplate => "boilerplate",
        }
    }

    /// Render the prompt for this task by substituting `{{INPUT}}`.
    pub fn build_prompt(self, input: &str) -> String {
        let template = match self {
            Task::Summarize => include_str!("prompts/summarize.txt"),
            Task::Docstring => include_str!("prompts/docstring.txt"),
            Task::Classify => include_str!("prompts/classify.txt"),
            Task::Boilerplate => include_str!("prompts/boilerplate.txt"),
        };
        template.replace("{{INPUT}}", input)
    }

    /// Per-task tuning hints for Ollama. Classify wants short, deterministic;
    /// summarize/docstring/boilerplate want a bit of room.
    pub fn options(self) -> Option<crate::ollama::GenerateOptions> {
        match self {
            Task::Classify => Some(crate::ollama::GenerateOptions {
                temperature: Some(0.0),
                num_predict: Some(8),
            }),
            Task::Summarize => Some(crate::ollama::GenerateOptions {
                temperature: Some(0.2),
                num_predict: Some(256),
            }),
            Task::Docstring => Some(crate::ollama::GenerateOptions {
                temperature: Some(0.2),
                num_predict: Some(256),
            }),
            Task::Boilerplate => Some(crate::ollama::GenerateOptions {
                temperature: Some(0.3),
                num_predict: Some(512),
            }),
        }
    }

    /// Light post-processing on the model's raw text. Keeps each task's
    /// output stable for downstream consumers (the calling subagent).
    pub fn postprocess(self, raw: &str) -> String {
        match self {
            Task::Summarize => summarize::postprocess(raw),
            Task::Docstring => docstring::postprocess(raw),
            Task::Classify => classify::postprocess(raw),
            Task::Boilerplate => boilerplate::postprocess(raw),
        }
    }
}

impl FromStr for Task {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "summarize" | "summary" => Ok(Task::Summarize),
            "docstring" | "doc" => Ok(Task::Docstring),
            "classify" | "class" => Ok(Task::Classify),
            "boilerplate" | "boiler" => Ok(Task::Boilerplate),
            other => Err(anyhow!(
                "unknown task `{other}`. Expected: summarize, docstring, classify, boilerplate"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_prompt_substitutes_input() {
        let p = Task::Summarize.build_prompt("fn foo() {}");
        assert!(p.contains("fn foo() {}"));
        assert!(!p.contains("{{INPUT}}"));
    }

    #[test]
    fn task_parses_aliases() {
        assert_eq!(Task::from_str("summarize").unwrap(), Task::Summarize);
        assert_eq!(Task::from_str("Summary").unwrap(), Task::Summarize);
        assert_eq!(Task::from_str("doc").unwrap(), Task::Docstring);
        assert_eq!(Task::from_str("classify").unwrap(), Task::Classify);
        assert_eq!(Task::from_str("boiler").unwrap(), Task::Boilerplate);
        assert!(Task::from_str("rename").is_err());
    }

    #[test]
    fn classify_options_are_deterministic() {
        let opts = Task::Classify.options().unwrap();
        assert_eq!(opts.temperature, Some(0.0));
        assert_eq!(opts.num_predict, Some(8));
    }
}
