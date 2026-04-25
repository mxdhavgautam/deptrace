import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PackageJson } from "../types.js";

export async function readProjectPackageJson(cwd: string): Promise<{
  packageJson: PackageJson;
}> {
  const file = path.join(cwd, "package.json");
  const raw = await readFile(file, "utf8");

  try {
    return {
      packageJson: JSON.parse(raw) as PackageJson,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse package.json: ${message}`);
  }
}
