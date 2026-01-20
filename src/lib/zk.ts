import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";

const execAsync = promisify(exec);

export const ZK_NOTEBOOK_DIR = process.env.ZK_NOTEBOOK_DIR || `${process.env.HOME}/Sync/Notes`;
export const ZK_BIN = process.env.ZK_BIN || "/opt/homebrew/bin/zk";

export interface ZKNote {
  id: string;
  title: string;
  path: string;
  content?: string;
}

/**
 * Execute zk command with proper environment setup
 */
async function execZk(args: string[]): Promise<string> {
  const fullEnv = {
    ...process.env,
    ZK_NOTEBOOK_DIR,
    EDITOR: "/usr/bin/true",
    VISUAL: "/usr/bin/true",
  };

  const envString = Object.entries(fullEnv)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(" ");

  const command = `${envString} ${ZK_BIN} ${args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(" ")}`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      shell: "/bin/bash",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    // zk may output informational messages to stderr (like "Found X notes")
    // These are not errors, so we combine stdout and stderr
    const combinedOutput = [stdout, stderr]
      .filter(Boolean)
      .join("\n")
      .trim();

    // Check if stderr contains informational messages (not errors)
    const isInformationalMessage = (text: string): boolean => {
      if (!text || text.trim() === "") return true;
      const lower = text.toLowerCase();
      if (lower.includes("found") && lower.includes("notes")) {
        return true;
      }
      if (lower.includes("warning")) {
        return true;
      }
      return false;
    };

    // Never throw error for informational messages
    // Only throw if stderr contains actual errors AND no valid output
    if (stderr && !isInformationalMessage(stderr)) {
      const hasValidOutput = stdout && (
        stdout.includes("[") ||
        stdout.includes("{") ||
        stdout.includes(".md") ||
        stdout.trim().length > 0
      );

      if (!hasValidOutput) {
        throw new Error(stderr);
      }
    }

    return combinedOutput;
  } catch (error: any) {
    const stdout = error.stdout || "";
    const stderr = error.stderr || "";
    const errorMessage = error.message || String(error);

    const allOutput = [stdout, stderr, errorMessage].filter(Boolean).join("\n");
    const outputLower = allOutput.toLowerCase();

    // Never throw if output contains "Found X notes" - it's informational
    if (outputLower.includes("found") && outputLower.includes("notes")) {
      const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
      return combined || allOutput;
    }

    throw new Error(`zk command failed: ${errorMessage}`);
  }
}

/**
 * Extract JSON from zk output (handles "Found X notes" messages)
 */
function extractJson(output: string): string {
  // Remove informational messages like "Found X notes"
  const cleaned = output
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.match(/^Found \d+ notes?$/i) &&
        !trimmed.toLowerCase().includes("warning:")
      );
    })
    .join("\n");

  // Try to find JSON array in the output
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // If no array found, try to find JSON object
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }

  // If no JSON found, return the cleaned output (will fail parsing with better error)
  return cleaned.trim();
}

/**
 * List all ZK notes (sorted by modification date, most recent first)
 */
export async function listNotes(): Promise<ZKNote[]> {
  try {
    const output = await execZk(["list", "--format", "json", "--sort", "modified"]);
    const jsonOutput = extractJson(output);
    const notes = JSON.parse(jsonOutput);

    if (!Array.isArray(notes)) {
      throw new Error("Expected array of notes");
    }

    return notes.map((note: any) => ({
      id: note.id || note.path || "",
      title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: note.path || note.id || "",
    }));
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorLower = errorMessage.toLowerCase();

    // If error message contains "Found X notes", try to extract JSON from it
    if (errorLower.includes("found") && errorLower.includes("notes")) {
      try {
        const jsonOutput = extractJson(errorMessage);
        const notes = JSON.parse(jsonOutput);
        if (Array.isArray(notes)) {
          return notes.map((note: any) => ({
            id: note.id || note.path || "",
            title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
            path: note.path || note.id || "",
          }));
        }
      } catch {
        // Continue to fallback
      }
    }

    // Fallback: try without JSON format
    try {
      const output = await execZk(["list", "--sort", "modified"]);
      const lines = output.split("\n").filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.match(/^Found \d+ notes?$/i);
      });

      return lines.map((line) => {
        const path = line.trim();
        const title = path.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
        return {
          id: path,
          title,
          path,
        };
      });
    } catch (fallbackError: any) {
      const fallbackMessage = fallbackError.message || String(fallbackError);
      if (fallbackMessage.toLowerCase().includes("found") && fallbackMessage.toLowerCase().includes("notes")) {
        throw fallbackError;
      }
      throw new Error(`Failed to list notes: ${errorMessage}`);
    }
  }
}

/**
 * Search ZK notes by tag
 */
export async function searchByTag(tag: string): Promise<ZKNote[]> {
  try {
    const args = ["list", "--format", "json", "--no-input", "--quiet", "--tag", tag];
    const output = await execZk(args);
    const jsonOutput = extractJson(output);
    const notes = JSON.parse(jsonOutput);

    if (!Array.isArray(notes)) {
      throw new Error("Expected array of notes");
    }

    return notes.map((note: any) => ({
      id: note.id || note.path || "",
      title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: note.path || note.id || "",
    }));
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorLower = errorMessage.toLowerCase();

    if (errorLower.includes("found") && errorLower.includes("notes")) {
      try {
        const jsonOutput = extractJson(errorMessage);
        const notes = JSON.parse(jsonOutput);
        if (Array.isArray(notes)) {
          return notes.map((note: any) => ({
            id: note.id || note.path || "",
            title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
            path: note.path || note.id || "",
          }));
        }
      } catch {
        // Continue to return empty
      }
    }

    // Return empty array for tag searches that fail (tag might not exist)
    return [];
  }
}

/**
 * Search ZK notes by date
 */
export async function searchByDate(dateQuery: string): Promise<ZKNote[]> {
  const args = ["list", "--format", "json", "--no-input", "--quiet"];

  // Parse date patterns
  const lowerQuery = dateQuery.toLowerCase();

  if (lowerQuery === "today") {
    args.push("--created", "today");
  } else if (lowerQuery === "yesterday") {
    args.push("--created", "yesterday");
  } else if (lowerQuery === "week" || lowerQuery === "this week") {
    args.push("--created-after", "last monday");
  } else if (lowerQuery === "month" || lowerQuery === "this month") {
    args.push("--created-after", "last month");
  } else if (lowerQuery === "recent" || lowerQuery === "modified") {
    args.push("--sort", "modified");
  } else if (lowerQuery.startsWith("created:")) {
    // Allow custom date: @created:yesterday, @created:last tuesday
    args.push("--created", dateQuery.slice(8).trim());
  } else if (lowerQuery.startsWith("modified:")) {
    // Allow custom date: @modified:yesterday
    args.push("--modified", dateQuery.slice(9).trim());
  } else if (lowerQuery.startsWith("after:")) {
    args.push("--created-after", dateQuery.slice(6).trim());
  } else if (lowerQuery.startsWith("before:")) {
    args.push("--created-before", dateQuery.slice(7).trim());
  } else {
    // Try to use as a direct date
    args.push("--created", dateQuery);
  }

  try {
    const output = await execZk(args);
    const jsonOutput = extractJson(output);
    const notes = JSON.parse(jsonOutput);

    if (!Array.isArray(notes)) {
      throw new Error("Expected array of notes");
    }

    return notes.map((note: any) => ({
      id: note.id || note.path || "",
      title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: note.path || note.id || "",
    }));
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorLower = errorMessage.toLowerCase();

    if (errorLower.includes("found") && errorLower.includes("notes")) {
      try {
        const jsonOutput = extractJson(errorMessage);
        const notes = JSON.parse(jsonOutput);
        if (Array.isArray(notes)) {
          return notes.map((note: any) => ({
            id: note.id || note.path || "",
            title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
            path: note.path || note.id || "",
          }));
        }
      } catch {
        // Continue to return empty
      }
    }

    // Return empty array for date searches that fail
    return [];
  }
}

/**
 * Search ZK notes by links
 * - >note: notes linked by the given note (outgoing links)
 * - <note: notes linking to the given note (backlinks)
 * - ~note: notes related to the given note
 * - !orphan: orphan notes (no backlinks)
 */
export async function searchByLinks(linkQuery: string, mode: "linked-by" | "link-to" | "related" | "orphan"): Promise<ZKNote[]> {
  const args = ["list", "--format", "json", "--no-input", "--quiet", "--sort", "modified"];

  if (mode === "orphan") {
    args.push("--orphan");
  } else {
    args.push(`--${mode}`, linkQuery);
  }

  try {
    const output = await execZk(args);
    const jsonOutput = extractJson(output);
    const notes = JSON.parse(jsonOutput);

    if (!Array.isArray(notes)) {
      throw new Error("Expected array of notes");
    }

    return notes.map((note: any) => ({
      id: note.id || note.path || "",
      title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: note.path || note.id || "",
    }));
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorLower = errorMessage.toLowerCase();

    if (errorLower.includes("found") && errorLower.includes("notes")) {
      try {
        const jsonOutput = extractJson(errorMessage);
        const notes = JSON.parse(jsonOutput);
        if (Array.isArray(notes)) {
          return notes.map((note: any) => ({
            id: note.id || note.path || "",
            title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
            path: note.path || note.id || "",
          }));
        }
      } catch {
        // Continue to return empty
      }
    }

    return [];
  }
}

/**
 * Search ZK notes using zk's built-in search
 * Supports special prefixes:
 * - #tag: search by tag
 * - @date: search by date (today, yesterday, week, month, recent)
 * - >note: notes linked by note (outgoing)
 * - <note: backlinks to note
 * - ~note: related notes
 * - !orphan: orphan notes
 */
export async function searchNotes(query: string): Promise<ZKNote[]> {
  // Check if query is a tag search
  if (query.startsWith("#")) {
    const tag = query.slice(1).trim();
    if (tag) {
      return searchByTag(tag);
    }
    return listNotes();
  }

  // Check if query is a date search
  if (query.startsWith("@")) {
    const dateQuery = query.slice(1).trim();
    if (dateQuery) {
      return searchByDate(dateQuery);
    }
    return listNotes();
  }

  // Check if query is a link search
  if (query.startsWith(">")) {
    const noteRef = query.slice(1).trim();
    if (noteRef) {
      return searchByLinks(noteRef, "linked-by");
    }
    return listNotes();
  }

  if (query.startsWith("<")) {
    const noteRef = query.slice(1).trim();
    if (noteRef) {
      return searchByLinks(noteRef, "link-to");
    }
    return listNotes();
  }

  if (query.startsWith("~")) {
    const noteRef = query.slice(1).trim();
    if (noteRef) {
      return searchByLinks(noteRef, "related");
    }
    return listNotes();
  }

  if (query.startsWith("!")) {
    const cmd = query.slice(1).trim().toLowerCase();
    if (cmd === "orphan" || cmd === "orphans") {
      return searchByLinks("", "orphan");
    }
    // Fall through to regular search if not a recognized command
  }

  try {
    const args = ["list", "--format", "json", "--no-input", "--quiet", "--sort", "modified", "--match", query];
    const output = await execZk(args);
    const jsonOutput = extractJson(output);
    const notes = JSON.parse(jsonOutput);

    if (!Array.isArray(notes)) {
      throw new Error("Expected array of notes");
    }

    return notes.map((note: any) => ({
      id: note.id || note.path || "",
      title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
      path: note.path || note.id || "",
    }));
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorLower = errorMessage.toLowerCase();

    // If error message contains "Found X notes", try to extract JSON from error
    if (errorLower.includes("found") && errorLower.includes("notes")) {
      try {
        const jsonOutput = extractJson(errorMessage);
        const notes = JSON.parse(jsonOutput);
        if (Array.isArray(notes)) {
          return notes.map((note: any) => ({
            id: note.id || note.path || "",
            title: note.title || note.path?.split("/").pop()?.replace(/\.md$/, "") || "Untitled",
            path: note.path || note.id || "",
          }));
        }
      } catch {
        // Continue to fallback
      }
    }

    // Fallback: list all and filter client-side
    try {
      const allNotes = await listNotes();
      const queryLower = query.toLowerCase();

      return allNotes.filter((note) => {
        const titleLower = note.title.toLowerCase();
        const pathLower = note.path.toLowerCase();
        return titleLower.includes(queryLower) || pathLower.includes(queryLower);
      });
    } catch (fallbackError: any) {
      const fallbackMessage = fallbackError.message || String(fallbackError);
      if (fallbackMessage.toLowerCase().includes("found") && fallbackMessage.toLowerCase().includes("notes")) {
        throw fallbackError;
      }
      throw new Error(`Failed to search notes: ${errorMessage}`);
    }
  }
}

/**
 * Open note in editor (Neovide or Ghostty + nvim)
 */
export async function openNote(notePath: string): Promise<void> {
  // Ensure we have an absolute path
  const absolutePath = notePath.startsWith("/")
    ? notePath
    : join(ZK_NOTEBOOK_DIR, notePath);

  const { execSync, spawn } = require("child_process");

  // Try Neovide first
  try {
    execSync(`open -a Neovide "${absolutePath}"`, { shell: "/bin/bash" });
    return;
  } catch {
    // Fallback to Ghostty
  }

  // Try Ghostty with spawn (non-blocking)
  const ghosttyBin = "/Applications/Ghostty.app/Contents/MacOS/ghostty";
  const nvimBin = "/opt/homebrew/bin/nvim";
  try {
    const child = spawn(ghosttyBin, ["-e", nvimBin, absolutePath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  } catch {
    // Fallback to system default
    try {
      execSync(`open "${absolutePath}"`, { shell: "/bin/bash" });
    } catch (defaultError: any) {
      throw defaultError;
    }
  }
}

/**
 * Get note content (for preview)
 */
export async function getNoteContent(notePath: string): Promise<string> {
  // Ensure we have an absolute path
  const absolutePath = notePath.startsWith("/")
    ? notePath
    : join(ZK_NOTEBOOK_DIR, notePath);

  try {
    const fs = require("fs").promises;
    const content = await fs.readFile(absolutePath, "utf-8");
    return content;
  } catch (error: any) {
    return `Error reading note: ${error.message}`;
  }
}
