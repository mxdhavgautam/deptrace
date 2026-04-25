import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConfigMatch, Confidence, FileCategory, TargetInfo } from "../types.js";
import { derivePackageAliases } from "./aliases.js";
import { isKnownEcosystemConfig, toPosix } from "../scan/classify.js";
import { typeDirectiveToPackage } from "../package/target.js";
import { specifierMatchesTarget } from "../package/match.js";

export async function scanConfigFile(
  file: string,
  absolutePath: string,
  category: FileCategory,
  target: TargetInfo,
): Promise<ConfigMatch[]> {
  const text = await readFile(absolutePath, "utf8");
  const matches: ConfigMatch[] = [];

  matches.push(...literalMatches(file, text, category, target));
  matches.push(...aliasMatches(file, text, category, target));
  matches.push(...tsconfigTypeMatches(file, text, category, target));
  matches.push(...tripleSlashTypeMatches(file, text, category, target));

  return dedupeMatches(matches);
}

function literalMatches(file: string, text: string, category: FileCategory, target: TargetInfo): ConfigMatch[] {
  if (path.posix.basename(toPosix(file)) === "package.json") {
    return [];
  }

  const confidence = literalConfidence(file);
  return findTokenMatches(text, target.packageName).map((location) => ({
    file,
    line: location.line,
    column: location.column,
    kind: confidence === "low" ? "raw-text" : "literal",
    matched: target.packageName,
    packageName: target.packageName,
    confidence,
    fileCategory: category,
  }));
}

function aliasMatches(file: string, text: string, category: FileCategory, target: TargetInfo): ConfigMatch[] {
  const aliases = derivePackageAliases(target.packageName);
  const confidence: Confidence = isKnownEcosystemConfig(file) ? "medium" : "low";
  const matches: ConfigMatch[] = [];

  for (const alias of aliases) {
    for (const location of findTokenMatches(text, alias)) {
      matches.push({
        file,
        line: location.line,
        column: location.column,
        kind: "plugin-alias",
        matched: alias,
        packageName: target.packageName,
        confidence,
        fileCategory: category,
      });
    }
  }

  return matches;
}

function tsconfigTypeMatches(file: string, text: string, category: FileCategory, target: TargetInfo): ConfigMatch[] {
  if (!/^tsconfig.*\.json$/.test(path.posix.basename(toPosix(file)))) {
    return [];
  }

  const parsed = parseJsonWithComments(text);
  const types = parsed?.compilerOptions?.types;
  if (!Array.isArray(types)) {
    return [];
  }

  const matches: ConfigMatch[] = [];

  for (const typeName of types) {
    if (typeof typeName !== "string") {
      continue;
    }

    const typePackage = typeDirectiveToPackage(typeName);
    if (!specifierMatchesTarget(typePackage.packageName, typePackage.subpath, [typeName], target)) {
      continue;
    }

    const location = findTokenMatches(text, typeName)[0];
    matches.push({
      file,
      line: location?.line,
      column: location?.column,
      kind: "tsconfig-types",
      matched: typeName,
      packageName: typePackage.packageName,
      confidence: "high",
      fileCategory: category,
    });
  }

  return matches;
}

function tripleSlashTypeMatches(file: string, text: string, category: FileCategory, target: TargetInfo): ConfigMatch[] {
  const matches: ConfigMatch[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/\/\/\/\s*<reference\s+types=["']([^"']+)["']\s*\/>/);
    if (!match) {
      continue;
    }

    const typeName = match[1];
    const typePackage = typeDirectiveToPackage(typeName);
    if (!specifierMatchesTarget(typePackage.packageName, typePackage.subpath, [typeName], target)) {
      continue;
    }

    matches.push({
      file,
      line: index + 1,
      column: lines[index].indexOf(match[0]) + 1,
      kind: "triple-slash-reference",
      matched: typeName,
      packageName: typePackage.packageName,
      confidence: "high",
      fileCategory: category,
    });
  }

  return matches;
}

function literalConfidence(file: string): Confidence {
  const basename = path.posix.basename(toPosix(file));

  if (basename === ".envrc") {
    return "low";
  }

  return isKnownEcosystemConfig(file) || basename === "package.json" || /^tsconfig.*\.json$/.test(basename)
    ? "high"
    : "low";
}

function findTokenMatches(text: string, token: string): Array<{ line: number; column: number }> {
  const matches: Array<{ line: number; column: number }> = [];
  const escaped = escapeRegExp(token);
  const regex = new RegExp(`(^|[^A-Za-z0-9_@/-])(${escaped})(?=$|[^A-Za-z0-9_@/-])`, "g");
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line))) {
      matches.push({
        line: index + 1,
        column: match.index + match[1].length + 1,
      });
    }
  }

  return matches;
}

function parseJsonWithComments(text: string): any | null {
  try {
    const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutLineComments = withoutBlockComments.replace(/(^|[^:])\/\/.*$/gm, "$1");
    return JSON.parse(withoutLineComments);
  } catch {
    return null;
  }
}

function dedupeMatches(matches: ConfigMatch[]): ConfigMatch[] {
  const seen = new Set<string>();
  const unique: ConfigMatch[] = [];

  for (const match of matches) {
    const key = `${match.file}:${match.line ?? ""}:${match.column ?? ""}:${match.kind}:${match.matched}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(match);
  }

  return unique.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
