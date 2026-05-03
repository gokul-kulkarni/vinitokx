//! Boilerplate task: keep the fenced code block intact, drop any prose
//! the model added before or after.

pub fn postprocess(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some((_, after_open)) = trimmed.split_once("```") {
        if let Some((body, _)) = after_open.split_once("```") {
            // Drop the newline that follows the opening fence.
            let body = body.trim_start_matches('\n');
            let result = if let Some((first_line, rest)) = body.split_once('\n') {
                let is_lang_tag = !first_line.is_empty()
                    && first_line
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
                if is_lang_tag {
                    rest
                } else {
                    body
                }
            } else {
                body
            };
            return result.trim_end().to_string();
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_body_from_fence_with_language() {
        let raw = "```typescript\nexport const x = 1;\n```";
        assert_eq!(postprocess(raw), "export const x = 1;");
    }

    #[test]
    fn extracts_body_from_unlabeled_fence() {
        let raw = "```\nlet y = 2\n```";
        assert_eq!(postprocess(raw), "let y = 2");
    }

    #[test]
    fn drops_prose_around_fence() {
        let raw = "Sure, here you go:\n\n```rust\nfn main() {}\n```\n\nLet me know if you want changes.";
        assert_eq!(postprocess(raw), "fn main() {}");
    }

    #[test]
    fn passes_through_when_no_fence() {
        let raw = "let z = 3;";
        assert_eq!(postprocess(raw), "let z = 3;");
    }
}
