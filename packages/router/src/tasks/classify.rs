//! Classify task: pin output to one of {bug, feature, refactor, chore}.

const LABELS: &[&str] = &["bug", "feature", "refactor", "chore"];

pub fn postprocess(raw: &str) -> String {
    let cleaned: String = raw
        .trim()
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect::<String>()
        .to_ascii_lowercase();

    if LABELS.contains(&cleaned.as_str()) {
        return cleaned;
    }
    // Loose contains-fallback so a verbose model ("This is a bug fix.")
    // still produces a usable label.
    let lower = raw.to_ascii_lowercase();
    for label in LABELS {
        if lower.contains(label) {
            return (*label).to_string();
        }
    }
    "chore".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_clean_label_unchanged() {
        assert_eq!(postprocess("bug"), "bug");
        assert_eq!(postprocess("feature\n"), "feature");
        assert_eq!(postprocess("REFACTOR"), "refactor");
    }

    #[test]
    fn extracts_label_from_verbose_response() {
        assert_eq!(postprocess("This is clearly a bug fix."), "bug");
        assert_eq!(
            postprocess("Looks like a refactor with some chore mixed in"),
            "refactor"
        );
    }

    #[test]
    fn defaults_to_chore_when_unknown() {
        assert_eq!(postprocess("???"), "chore");
        assert_eq!(postprocess(""), "chore");
    }
}
