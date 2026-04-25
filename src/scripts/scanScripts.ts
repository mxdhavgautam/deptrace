import path from "node:path";
import type { PackageJson, ScriptMatch, TargetInfo } from "../types.js";

const wrappers = new Set(["npx", "pnpm", "bunx", "cross-env", "concurrently", "run-p", "run-s", "npm", "yarn", "bun"]);

export function scanScripts(packageJson: PackageJson, target: TargetInfo, binNames: string[]): ScriptMatch[] {
  const scripts = packageJson.scripts ?? {};
  const matches: ScriptMatch[] = [];
  const matchTokens = new Map<string, "package-name" | "bin">();

  matchTokens.set(target.packageName, "package-name");
  for (const binName of binNames) {
    matchTokens.set(binName, "bin");
  }

  for (const [scriptName, command] of Object.entries(scripts)) {
    const tokens = expandTokens(tokenizeShellish(command));

    for (const token of tokens) {
      const rawToken = stripExecutableExtension(token.trim());
      if (!rawToken || wrappers.has(rawToken) || rawToken.startsWith("-") || isEnvAssignment(rawToken)) {
        continue;
      }

      const normalized = normalizeCommandPath(rawToken);
      const matchKind = matchTokens.get(rawToken) ?? matchTokens.get(normalized);
      if (!matchKind) {
        continue;
      }

      matches.push({
        scriptName,
        command,
        matchedToken: matchTokens.has(rawToken) ? rawToken : normalized,
        matchKind,
        confidence: "high",
      });
      break;
    }
  }

  return matches;
}

export function tokenizeShellish(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char) || [";", "|", "&", "(", ")"].includes(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function expandTokens(tokens: string[]): string[] {
  const expanded: string[] = [];

  for (const token of tokens) {
    if (/\s|[;&|()]/.test(token)) {
      expanded.push(...tokenizeShellish(token));
    } else {
      expanded.push(token);
    }
  }

  return expanded;
}

function normalizeCommandPath(token: string): string {
  const basename = path.posix.basename(token.replace(/\\/g, "/"));
  return stripExecutableExtension(basename);
}

function stripExecutableExtension(token: string): string {
  return token.replace(/\.(cmd|ps1|exe)$/i, "");
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}
