import type { DeptraceReport } from "../types.js";

export function formatJsonReport(report: DeptraceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
