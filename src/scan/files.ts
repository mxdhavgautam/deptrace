import { stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { classifyFile, isConfigFile, toPosix } from "./classify.js";
import type { FileCategory } from "../types.js";

const maxSourceFileBytes = 1024 * 1024;

const baseIgnore = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.svelte-kit/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.cache/**",
  "**/.turbo/**",
  "**/out/**",
  "**/vendor/**",
  "**/*.min.js",
];

const sourceGlobs = ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"];

const configGlobs = [
  "package.json",
  "**/tsconfig*.json",
  "**/*.config.{js,cjs,mjs,ts,mts,cts,json}",
  "**/.*rc",
  "**/.*rc.{json,js,cjs,mjs,yml,yaml}",
  "**/.eslintrc*",
  "**/.prettierrc*",
  "**/.babelrc*",
];

export type ScannedFile = {
  path: string;
  absolutePath: string;
  category: FileCategory;
  isConfig: boolean;
};

export type FileScanResult = {
  sourceFiles: ScannedFile[];
  configFiles: ScannedFile[];
  filesSkipped: number;
  skippedReasons: Record<string, number>;
};

export async function findFiles(cwd: string, workspacePatterns: string[]): Promise<FileScanResult> {
  const ignore = [...baseIgnore, ...workspacePatterns.map(toWorkspaceIgnorePattern)];
  const skippedReasons: Record<string, number> = {};

  const [sourceMatches, configMatches] = await Promise.all([
    fg(sourceGlobs, { cwd, dot: true, onlyFiles: true, ignore }),
    fg(configGlobs, { cwd, dot: true, onlyFiles: true, ignore }),
  ]);

  const sourceFiles: ScannedFile[] = [];
  const configFiles: ScannedFile[] = [];
  const seenSource = new Set<string>();
  const seenConfig = new Set<string>();

  for (const file of sourceMatches.map(toPosix).sort()) {
    if (seenSource.has(file)) {
      continue;
    }
    seenSource.add(file);

    if (await isTooLarge(cwd, file)) {
      increment(skippedReasons, "tooLarge");
      continue;
    }

    sourceFiles.push({
      path: file,
      absolutePath: path.join(cwd, file),
      category: classifyFile(file),
      isConfig: isConfigFile(file),
    });
  }

  for (const file of configMatches.map(toPosix).sort()) {
    if (seenConfig.has(file)) {
      continue;
    }
    seenConfig.add(file);

    configFiles.push({
      path: file,
      absolutePath: path.join(cwd, file),
      category: classifyFile(file),
      isConfig: true,
    });
  }

  return {
    sourceFiles,
    configFiles,
    filesSkipped: Object.values(skippedReasons).reduce((sum, count) => sum + count, 0),
    skippedReasons,
  };
}

function toWorkspaceIgnorePattern(pattern: string): string {
  const trimmed = pattern.replace(/\/+$/, "");
  return `${trimmed}/**`;
}

async function isTooLarge(cwd: string, file: string): Promise<boolean> {
  const result = await stat(path.join(cwd, file));
  return result.size > maxSourceFileBytes;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}
