import path from "node:path";
import type { FileCategory } from "../types.js";

export function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

export function classifyFile(file: string): FileCategory {
  const normalized = toPosix(file);
  const basename = path.posix.basename(normalized);

  if (basename === "package.json") {
    return "declaration";
  }

  if (isConfigFile(normalized)) {
    return "config";
  }

  if (basename.endsWith(".d.ts")) {
    return "declaration";
  }

  if (isTestFile(normalized)) {
    return "test";
  }

  if (/^(scripts|script|tools|tooling|bin|cli)\//.test(normalized)) {
    return normalized.startsWith("scripts/") || normalized.startsWith("script/") ? "script" : "tooling";
  }

  if (
    /^(src|app|pages|components|lib|server|api|routes|workers|jobs|utils|shared|middleware)\b/.test(normalized)
  ) {
    return "source";
  }

  return "unknown";
}

export function isConfigFile(file: string): boolean {
  const normalized = toPosix(file);
  const basename = path.posix.basename(normalized);

  return (
    /^tsconfig.*\.json$/.test(basename) ||
    /^.+\.config\.(js|cjs|mjs|ts|mts|cts|json)$/.test(basename) ||
    /^\.eslintrc/.test(basename) ||
    /^\.prettierrc/.test(basename) ||
    /^\.babelrc/.test(basename) ||
    /^\..*rc(\.(json|js|cjs|mjs|yml|yaml))?$/.test(basename)
  );
}

export function isKnownEcosystemConfig(file: string): boolean {
  const basename = path.posix.basename(toPosix(file));

  return (
    /^\.eslintrc/.test(basename) ||
    /^\.prettierrc/.test(basename) ||
    /^\.babelrc/.test(basename) ||
    /^eslint\.config\./.test(basename) ||
    /^prettier\.config\./.test(basename) ||
    /^babel\.config\./.test(basename) ||
    /^postcss\.config\./.test(basename) ||
    /^tailwind\.config\./.test(basename) ||
    /^vite\.config\./.test(basename) ||
    /^vitest\.config\./.test(basename) ||
    /^jest\.config\./.test(basename) ||
    /^playwright\.config\./.test(basename)
  );
}

export function isTestFile(file: string): boolean {
  const normalized = toPosix(file);
  const basename = path.posix.basename(normalized);

  return (
    /(^|\/)(__tests__|test|tests|spec|e2e)(\/|$)/.test(normalized) ||
    /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(basename)
  );
}
