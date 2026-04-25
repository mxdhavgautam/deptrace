import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, InstallationInfo, PackageJson } from "../types.js";

export async function getInstalledPackage(cwd: string, packageName: string): Promise<{
  installation: InstallationInfo;
  diagnostics: Diagnostic[];
}> {
  const packageJsonPath = path.join(cwd, "node_modules", ...packageName.split("/"), "package.json");

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
    const binNames = getBinNames(packageJson, packageName);

    return {
      installation: {
        installed: true,
        version: packageJson.version ?? null,
        lockfileVersion: null,
        packageJsonPath,
        binNames,
      },
      diagnostics: [],
    };
  } catch {
    const lockVersion = await getPackageLockVersion(cwd, packageName);

    return {
      installation: {
        installed: false,
        version: null,
        lockfileVersion: lockVersion,
        packageJsonPath: null,
        binNames: [],
      },
      diagnostics: [
        {
          level: "info",
          code: "package-not-installed",
          message: lockVersion
            ? `Package is not installed in node_modules; package-lock.json contains version ${lockVersion}, but installed version could not be resolved.`
            : `Package is not installed in node_modules; installed version could not be resolved.`,
        },
      ],
    };
  }
}

function getBinNames(packageJson: PackageJson, packageName: string): string[] {
  const bin = packageJson.bin;

  if (!bin) {
    return [];
  }

  if (typeof bin === "string") {
    return [packageName.split("/").at(-1) ?? packageName];
  }

  return Object.keys(bin).sort();
}

async function getPackageLockVersion(cwd: string, packageName: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(cwd, "package-lock.json"), "utf8");
    const lock = JSON.parse(raw) as {
      packages?: Record<string, { version?: string }>;
      dependencies?: Record<string, { version?: string }>;
    };

    return (
      lock.packages?.[`node_modules/${packageName}`]?.version ??
      lock.dependencies?.[packageName]?.version ??
      null
    );
  } catch {
    return null;
  }
}
