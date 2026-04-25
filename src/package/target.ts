import type { TargetInfo } from "../types.js";

export function normalizeTarget(rawTarget: string): TargetInfo {
  const raw = rawTarget.trim();

  if (!raw) {
    throw new Error("A dependency target is required.");
  }

  const parts = raw.split("/").filter(Boolean);

  if (raw.startsWith("@")) {
    if (parts.length < 2) {
      throw new Error(`Invalid scoped package target: ${raw}`);
    }

    const packageName = `${parts[0]}/${parts[1]}`;
    const subpath = parts.slice(2).join("/") || null;

    return {
      raw,
      packageName,
      subpath,
      normalized: raw !== packageName,
    };
  }

  const [packageName, ...subpathParts] = parts;

  if (!packageName) {
    throw new Error(`Invalid package target: ${raw}`);
  }

  const subpath = subpathParts.join("/") || null;

  return {
    raw,
    packageName,
    subpath,
    normalized: raw !== packageName,
  };
}

export function parseSpecifier(specifier: string): Pick<TargetInfo, "packageName" | "subpath"> {
  return normalizeTarget(specifier);
}

export function tryParseSpecifier(specifier: string): Pick<TargetInfo, "packageName" | "subpath"> | null {
  try {
    return parseSpecifier(specifier);
  } catch {
    return null;
  }
}

export function typeDirectiveToPackage(typeName: string): Pick<TargetInfo, "packageName" | "subpath"> {
  if (typeName.startsWith("@")) {
    return parseSpecifier(typeName);
  }

  if (typeName.includes("/")) {
    return parseSpecifier(typeName);
  }

  return {
    packageName: `@types/${typeName}`,
    subpath: null,
  };
}
