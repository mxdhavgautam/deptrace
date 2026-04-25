import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportRecord, RuntimeSignal } from "../types.js";
import { toPosix } from "../scan/classify.js";

export async function getRuntimeSignals(imports: ImportRecord[], cwd: string): Promise<RuntimeSignal[]> {
  const files = [...new Set(imports.filter((record) => !record.isTypeOnly).map((record) => record.file))].sort();
  const signals: RuntimeSignal[] = [];

  for (const file of files) {
    const normalized = toPosix(file);
    const basename = path.posix.basename(normalized);
    const text = await readFile(path.join(cwd, file), "utf8").catch(() => "");
    const hasUseClient = /^\s*["']use client["'];?/m.test(text.split(/\r?\n/).slice(0, 8).join("\n"));

    if (hasUseClient) {
      signals.push({
        kind: "client-directive",
        confidence: "high",
        file,
        reason: 'file has a "use client" directive',
      });
      continue;
    }

    if (/\.client\.(js|jsx|ts|tsx|mjs|mts)$/.test(basename)) {
      signals.push({
        kind: "browser-likely",
        confidence: "high",
        file,
        reason: "file uses a .client.* naming convention",
      });
      continue;
    }

    if (/^src\/(main|index|App)\.(jsx|tsx|js|ts)$/.test(normalized)) {
      signals.push({
        kind: "browser-likely",
        confidence: "medium",
        file,
        reason: "file looks like a browser app entrypoint",
      });
      continue;
    }

    if (/^(pages)\//.test(normalized) && !/^pages\/api\//.test(normalized)) {
      signals.push({
        kind: "browser-likely",
        confidence: "medium",
        file,
        reason: "file is under a Next.js pages route outside pages/api",
      });
      continue;
    }

    if (/^(server|api|pages\/api|app\/api)\//.test(normalized)) {
      signals.push({
        kind: "server-likely",
        confidence: "medium",
        file,
        reason: "file is under a server/API path",
      });
      continue;
    }

    if (/\.(jsx|tsx)$/.test(basename) || /(^|\/)components\//.test(normalized)) {
      signals.push({
        kind: "browser-likely",
        confidence: "low",
        file,
        reason: "file is JSX/TSX or lives under a component path",
      });
    }
  }

  return signals;
}
