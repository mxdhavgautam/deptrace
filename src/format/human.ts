import type { ConfigMatch, DeptraceReport, ImportRecord, RuntimeSignal, ScriptMatch } from "../types.js";

const importDisplayLimit = 20;

export function formatHumanReport(report: DeptraceReport): string {
  const lines: string[] = [];
  const installed = report.installation.version ? `@${report.installation.version}` : "";

  lines.push(`${report.target.packageName}${installed}`);
  lines.push("");

  if (report.target.normalized) {
    lines.push(`Target`);
    lines.push(`  normalized from: ${report.target.raw}`);
    if (report.target.subpath) {
      lines.push(`  subpath: ${report.target.subpath}`);
    }
    lines.push("");
  }

  lines.push("Package");
  lines.push(`  status: ${report.declaration.isDeclared ? "direct dependency" : "not declared"}`);
  lines.push(`  declared in: ${report.declaration.buckets.length > 0 ? report.declaration.buckets.join(", ") : "none"}`);
  lines.push(`  version range: ${formatRanges(report.declaration.ranges)}`);
  lines.push(`  installed: ${report.installation.version ?? "not resolved"}`);
  if (!report.installation.installed && report.installation.lockfileVersion) {
    lines.push(`  lockfile version: ${report.installation.lockfileVersion}`);
  }
  lines.push("");

  lines.push("Usage Summary");
  lines.push(`  source files: ${report.usage.sourceFiles}`);
  lines.push(`  test files: ${report.usage.testFiles}`);
  lines.push(`  config files: ${report.usage.configFiles}`);
  lines.push(`  script matches: ${report.usage.scriptMatches}`);
  lines.push(`  type-only imports: ${report.usage.typeOnlyImports}`);
  lines.push("");

  appendImports(lines, report.imports);
  appendScripts(lines, report.scripts);
  appendConfigs(lines, report.configs);
  appendRuntimeSignals(lines, report.runtimeSignals);

  lines.push("Verdict");
  lines.push(`  ${report.verdict.code}`);
  lines.push(`  confidence: ${report.verdict.confidence}`);
  if (report.verdict.reasons.length > 0) {
    lines.push("  reasons:");
    for (const reason of report.verdict.reasons) {
      lines.push(`    - ${reason}`);
    }
  }
  if (report.verdict.nextSteps.length > 0) {
    lines.push("  next steps:");
    for (const nextStep of report.verdict.nextSteps) {
      lines.push(`    - ${nextStep}`);
    }
  }
  lines.push("");

  if (report.diagnostics.length > 0) {
    lines.push("Diagnostics");
    for (const diagnostic of report.diagnostics) {
      const location = diagnostic.file ? ` ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}` : "";
      lines.push(`  ${diagnostic.level}: ${diagnostic.message}${location}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function appendImports(lines: string[], imports: ImportRecord[]): void {
  lines.push("Imports");
  if (imports.length === 0) {
    lines.push("  none detected");
    lines.push("");
    return;
  }

  if (imports.length > importDisplayLimit) {
    lines.push(`  showing ${importDisplayLimit} of ${imports.length} import sites`);
  }

  for (const record of imports.slice(0, importDisplayLimit)) {
    const symbols = record.symbols.length > 0 ? record.symbols.join(", ") : "(side effect)";
    const typeOnly = record.isTypeOnly ? " type-only" : "";
    lines.push(`  ${record.file}:${record.line}`);
    lines.push(`    ${symbols} from ${record.specifier} (${record.kind}${typeOnly}, ${record.fileCategory})`);
    if (record.code) {
      lines.push(`    ${record.code}`);
    }
  }

  if (imports.length > importDisplayLimit) {
    lines.push(`  +${imports.length - importDisplayLimit} more. Use --json for the full list.`);
  }

  lines.push("");
}

function appendScripts(lines: string[], scripts: ScriptMatch[]): void {
  lines.push("Script Usage");
  if (scripts.length === 0) {
    lines.push("  none detected");
    lines.push("");
    return;
  }

  for (const script of scripts) {
    lines.push(`  package.json scripts.${script.scriptName}`);
    lines.push(`    ${script.command}`);
    lines.push(`    matched ${script.matchKind}: ${script.matchedToken}`);
  }
  lines.push("");
}

function appendConfigs(lines: string[], configs: ConfigMatch[]): void {
  lines.push("Config Usage");
  if (configs.length === 0) {
    lines.push("  none detected");
    lines.push("");
    return;
  }

  for (const config of configs.slice(0, importDisplayLimit)) {
    const location = config.line ? `${config.file}:${config.line}` : config.file;
    lines.push(`  ${location}`);
    lines.push(`    ${config.kind}: ${config.matched} (${config.confidence} confidence)`);
  }

  if (configs.length > importDisplayLimit) {
    lines.push(`  +${configs.length - importDisplayLimit} more. Use --json for the full list.`);
  }
  lines.push("");
}

function appendRuntimeSignals(lines: string[], signals: RuntimeSignal[]): void {
  lines.push("Runtime Signal");
  if (signals.length === 0) {
    lines.push("  none detected");
    lines.push("");
    return;
  }

  for (const signal of signals) {
    lines.push(`  ${signal.file}`);
    lines.push(`    ${signal.kind}: ${signal.reason} (${signal.confidence} confidence)`);
  }
  lines.push("");
}

function formatRanges(ranges: DeptraceReport["declaration"]["ranges"]): string {
  const entries = Object.entries(ranges);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([bucket, range]) => `${bucket} ${range}`).join(", ");
}
