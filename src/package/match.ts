import type { ImportRecord, TargetInfo } from "../types.js";

export function recordMatchesTarget(record: Pick<ImportRecord, "packageName" | "subpath" | "symbols">, target: TargetInfo): boolean {
  if (record.packageName !== target.packageName) {
    return false;
  }

  if (!target.subpath) {
    return true;
  }

  const targetLeaf = target.subpath.split("/").at(-1);

  return (
    record.subpath === target.subpath ||
    record.subpath?.startsWith(`${target.subpath}/`) === true ||
    (targetLeaf ? record.symbols.includes(targetLeaf) : false)
  );
}

export function specifierMatchesTarget(
  packageName: string,
  subpath: string | null,
  symbols: string[],
  target: TargetInfo,
): boolean {
  return recordMatchesTarget({ packageName, subpath, symbols }, target);
}
