//! Summarize task: clean up trailing whitespace, drop leading blank lines.

pub fn postprocess(raw: &str) -> String {
    let trimmed = raw.trim_end();
    trimmed
        .lines()
        .skip_while(|l| l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_leading_blank_lines_and_trailing_space() {
        let raw = "\n\nThis file does X.\nIt also does Y.\n   \n";
        assert_eq!(postprocess(raw), "This file does X.\nIt also does Y.");
    }

    #[test]
    fn passes_through_clean_text() {
        let raw = "Single line summary.";
        assert_eq!(postprocess(raw), "Single line summary.");
    }
}
