import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Diagnostic, PackageJson } from "../types.js";

export type WorkspaceInfo = {
  detected: boolean;
  markers: string[];
  childWorkspacePatterns: string[];
  diagnostics: Diagnostic[];
};

export async function detectWorkspace(cwd: string, packageJson: PackageJson): Promise<WorkspaceInfo> {
  const markers: string[] = [];
  const patterns = new Set<string>();

  const packageJsonPatterns = getPackageJsonWorkspacePatterns(packageJson);
  if (packageJsonPatterns.length > 0) {
    markers.push("package.json workspaces");
    for (const pattern of packageJsonPatterns) {
      patterns.add(pattern);
    }
  }

  const markerFiles = ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json"];

  for (const marker of markerFiles) {
    if (await exists(path.join(cwd, marker))) {
      markers.push(marker);
    }
  }

  if (await exists(path.join(cwd, "pnpm-workspace.yaml"))) {
    for (const pattern of await readPnpmWorkspacePatterns(cwd)) {
      patterns.add(pattern);
    }
  }

  const detected = markers.length > 0;
  if (detected && patterns.size === 0) {
    patterns.add("apps/*");
    patterns.add("packages/*");
  }

  const childWorkspacePatterns = [...patterns].filter((pattern) => !pattern.startsWith("!")).sort();

  return {
    detected,
    markers,
    childWorkspacePatterns,
    diagnostics: detected
      ? [
          {
            level: "warning",
            code: "workspace-root-detected",
            message:
              "Workspace root detected. deptrace v0.1 analyzes only the selected package root; child workspace packages were not scanned. Use --cwd apps/foo to analyze one workspace package.",
          },
        ]
      : [],
  };
}

function getPackageJsonWorkspacePatterns(packageJson: PackageJson): string[] {
  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  }

  if (Array.isArray(packageJson.workspaces?.packages)) {
    return packageJson.workspaces.packages;
  }

  return [];
}

async function readPnpmWorkspacePatterns(cwd: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(cwd, "pnpm-workspace.yaml"), "utf8");
    const parsed = parseYaml(raw) as { packages?: unknown };

    return Array.isArray(parsed.packages) ? parsed.packages.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
