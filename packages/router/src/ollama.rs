//! Minimal Ollama HTTP client. Only `/api/generate` (non-streaming) for v1.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct GenerateRequest<'a> {
    pub model: &'a str,
    pub prompt: &'a str,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<GenerateOptions>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenerateOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_predict: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateResponse {
    pub response: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub done: bool,
}

pub fn generate(
    base_url: &str,
    model: &str,
    prompt: &str,
    options: Option<GenerateOptions>,
    timeout: Duration,
) -> Result<String> {
    let url = format!("{}/api/generate", base_url.trim_end_matches('/'));
    let body = GenerateRequest {
        model,
        prompt,
        stream: false,
        options,
    };
    let agent = ureq::AgentBuilder::new()
        .timeout(timeout)
        .timeout_connect(Duration::from_secs(2))
        .build();
    let response = agent
        .post(&url)
        .send_json(serde_json::to_value(&body).context("failed to serialise generate request")?)
        .with_context(|| format!("Ollama request to {} failed", url))?;
    let parsed: GenerateResponse = response
        .into_json()
        .context("Ollama returned non-JSON response")?;
    Ok(parsed.response)
}

/// Quick liveness probe for `ollama serve`. Returns `Ok(true)` if reachable.
pub fn is_alive(base_url: &str) -> bool {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(800))
        .timeout_connect(Duration::from_millis(400))
        .build()
        .get(&url)
        .call()
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;
    use tiny_http::{Method, Response, Server};

    fn spawn_mock(canned: &'static str) -> (String, mpsc::Sender<()>) {
        let server = Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}", server.server_addr().to_ip().unwrap());
        let (tx, rx) = mpsc::channel::<()>();
        thread::spawn(move || {
            for request in server.incoming_requests() {
                if rx.try_recv().is_ok() {
                    break;
                }
                if request.method() == &Method::Post && request.url().ends_with("/api/generate") {
                    let _ = request.respond(Response::from_string(canned));
                } else if request.url().ends_with("/api/tags") {
                    let _ = request.respond(Response::from_string("{}"));
                } else {
                    let _ = request.respond(Response::from_string("not found").with_status_code(404));
                }
            }
        });
        (url, tx)
    }

    #[test]
    fn generate_returns_response_field() {
        let (url, _tx) = spawn_mock(r#"{"response":"hello world","done":true}"#);
        let out = generate(&url, "fake-model", "say hi", None, Duration::from_secs(5)).unwrap();
        assert_eq!(out, "hello world");
    }

    #[test]
    fn is_alive_true_when_reachable() {
        let (url, _tx) = spawn_mock(r#"{"response":"x","done":true}"#);
        assert!(is_alive(&url));
    }

    #[test]
    fn is_alive_false_when_unreachable() {
        // Port 1 is reserved and won't accept connections in normal setups.
        assert!(!is_alive("http://127.0.0.1:1"));
    }
}
