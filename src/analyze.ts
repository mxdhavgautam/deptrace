import path from "node:path";
import type {
  DeptraceReport,
  Diagnostic,
  FileCategory,
  ImportRecord,
  PackageJson,
  TargetInfo,
  UsageSummary,
} from "./types.js";
import { normalizeTarget } from "./package/target.js";
import { readProjectPackageJson } from "./project/packageJson.js";
import { getDeclaration } from "./package/declaration.js";
import { getInstalledPackage } from "./package/installed.js";
import { detectWorkspace } from "./project/workspace.js";
import { findFiles } from "./scan/files.js";
import { collectImportsForFile } from "./ast/collectImports.js";
import { scanScripts } from "./scripts/scanScripts.js";
import { scanConfigFile } from "./config/scanConfig.js";
import { getRuntimeSignals } from "./runtime/signals.js";
import { getVerdict } from "./verdict/verdict.js";

export type AnalyzeOptions = {
  cwd: string;
  target: string;
  toolVersion: string;
};

export async function analyzeDependency(options: AnalyzeOptions): Promise<DeptraceReport> {
  const started = performance.now();
  const cwd = path.resolve(options.cwd);
  const target = normalizeTarget(options.target);
  const diagnostics: Diagnostic[] = [];

  const { packageJson } = await readProjectPackageJson(cwd);

  const { declaration, diagnostics: declarationDiagnostics } = getDeclaration(packageJson, target.packageName);
  diagnostics.push(...declarationDiagnostics);

  const { installation, diagnostics: installationDiagnostics } = await getInstalledPackage(cwd, target.packageName);
  diagnostics.push(...installationDiagnostics);

  const workspace = await detectWorkspace(cwd, packageJson);
  diagnostics.push(...workspace.diagnostics);

  const fileScan = await findFiles(cwd, workspace.detected ? workspace.childWorkspacePatterns : []);
  const astFiles = fileScan.sourceFiles;
  const configFiles = mergeConfigFiles(fileScan.configFiles, fileScan.sourceFiles.filter((file) => file.isConfig));

  const imports: ImportRecord[] = [];

  for (const file of astFiles) {
    const result = await collectImportsForFile(file.path, file.absolutePath, file.category, target);
    imports.push(...result.imports);
    diagnostics.push(...result.diagnostics);
  }

  const scripts = scanScripts(packageJson, target, installation.binNames);
  const configs = (
    await Promise.all(configFiles.map((file) => scanConfigFile(file.path, file.absolutePath, file.category, target)))
  ).flat();
  const runtimeSignals = await getRuntimeSignals(imports, cwd);
  const usage = getUsageSummary(imports, scripts.length, configs);
  const verdict = getVerdict({ declaration, imports, scripts, configs, runtimeSignals });

  if (!declaration.isDeclared && imports.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "imported-but-undeclared",
      message: `Package is imported but not declared in package.json.`,
    });
  }

  if (target.normalized) {
    diagnostics.push({
      level: "info",
      code: "target-normalized",
      message: `Normalized target "${target.raw}" to package "${target.packageName}".`,
    });
  }

  return {
    schemaVersion: 1,
    tool: {
      name: "deptrace",
      version: options.toolVersion,
    },
    target,
    package: {
      projectName: packageJson.name ?? null,
      packageName: target.packageName,
    },
    declaration,
    installation,
    usage,
    imports: imports.sort(compareImportRecords),
    scripts,
    configs,
    runtimeSignals,
    verdict,
    diagnostics,
    scan: {
      cwd,
      filesScanned: uniqueScannedFileCount(astFiles, configFiles),
      filesSkipped: fileScan.filesSkipped,
      skippedReasons: fileScan.skippedReasons,
      durationMs: Math.round(performance.now() - started),
      parser: "babel",
      workspace: {
        detected: workspace.detected,
        markers: workspace.markers,
        childWorkspacePatterns: workspace.childWorkspacePatterns,
      },
    },
  };
}

function mergeConfigFiles(
  configFiles: Array<{ path: string; absolutePath: string; category: FileCategory; isConfig: boolean }>,
  configLikeSourceFiles: Array<{ path: string; absolutePath: string; category: FileCategory; isConfig: boolean }>,
): Array<{ path: string; absolutePath: string; category: FileCategory; isConfig: boolean }> {
  const byPath = new Map<string, { path: string; absolutePath: string; category: FileCategory; isConfig: boolean }>();

  for (const file of [...configFiles, ...configLikeSourceFiles]) {
    byPath.set(file.path, file);
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function getUsageSummary(imports: ImportRecord[], scriptMatches: number, configs: Array<{ file: string }>): UsageSummary {
  const sourceFiles = uniqueFiles(imports.filter((record) => record.fileCategory === "source"));
  const testFiles = uniqueFiles(imports.filter((record) => record.fileCategory === "test"));
  const configImportFiles = uniqueFiles(imports.filter((record) => record.fileCategory === "config" || record.fileCategory === "declaration"));
  const configMatchFiles = new Set(configs.map((config) => config.file));
  const filesWithImports = new Set(imports.map((record) => record.file));

  return {
    sourceFiles: sourceFiles.size,
    testFiles: testFiles.size,
    configFiles: new Set([...configImportFiles, ...configMatchFiles]).size,
    scriptMatches,
    typeOnlyImports: imports.filter((record) => record.isTypeOnly).length,
    runtimeImports: imports.filter((record) => !record.isTypeOnly).length,
    totalImportRecords: imports.length,
    filesWithImports: filesWithImports.size,
  };
}

function uniqueFiles(records: ImportRecord[]): Set<string> {
  return new Set(records.map((record) => record.file));
}

function uniqueScannedFileCount(
  astFiles: Array<{ path: string }>,
  configFiles: Array<{ path: string }>,
): number {
  return new Set([...astFiles, ...configFiles].map((file) => file.path)).size;
}

function compareImportRecords(a: ImportRecord, b: ImportRecord): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
}
