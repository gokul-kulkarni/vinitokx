import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

export function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

// Claude Code's hashing scheme: replace '/' with '-' and prefix '-'.
// Example: /Users/foo/MyDrive/ai/vinitokx → -Users-foo-MyDrive-ai-vinitokx
export function hashCwd(cwd: string): string {
  return cwd.replace(/\//g, "-");
}

export interface ProjectDir {
  hash: string;
  path: string;
}

export async function listProjectDirs(): Promise<ProjectDir[]> {
  const root = projectsRoot();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const result: ProjectDir[] = [];
  for (const entry of entries) {
    const full = join(root, entry);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      result.push({ hash: entry, path: full });
    }
  }
  return result;
}

export async function listSessionFiles(projectPath: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(projectPath);
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.endsWith(".jsonl"))
    .map((e) => join(projectPath, e));
}

export async function resolveProjectDir(
  cwd: string
): Promise<ProjectDir | null> {
  const expectedHash = hashCwd(cwd);
  const root = projectsRoot();
  const path = join(root, expectedHash);
  try {
    const st = await stat(path);
    if (st.isDirectory()) {
      return { hash: expectedHash, path };
    }
  } catch {
    // not found
  }
  return null;
}
