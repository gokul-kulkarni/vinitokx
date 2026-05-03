//! Docstring task: strip code fences if the model wrapped the docstring.

pub fn postprocess(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with("```") {
        let mut lines: Vec<&str> = trimmed.lines().collect();
        if lines.first().map(|l| l.starts_with("```")).unwrap_or(false) {
            lines.remove(0);
        }
        if lines.last().map(|l| l.trim() == "```").unwrap_or(false) {
            lines.pop();
        }
        return lines.join("\n").trim_end().to_string();
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_fences_when_present() {
        let raw = "```rust\n/// adds two numbers\nfn add(a: i32, b: i32) -> i32\n```";
        let out = postprocess(raw);
        assert!(!out.contains("```"));
        assert!(out.contains("/// adds two numbers"));
    }

    #[test]
    fn passes_through_when_no_fence() {
        let raw = "/** Returns the user. */";
        assert_eq!(postprocess(raw), "/** Returns the user. */");
    }
}
