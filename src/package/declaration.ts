import type { DeclarationInfo, DependencyBucket, Diagnostic, PackageJson } from "../types.js";

const bucketOrder: DependencyBucket[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

export function getDeclaration(packageJson: PackageJson, packageName: string): {
  declaration: DeclarationInfo;
  diagnostics: Diagnostic[];
} {
  const buckets: DependencyBucket[] = [];
  const ranges: DeclarationInfo["ranges"] = {};

  for (const bucket of bucketOrder) {
    const range = packageJson[bucket]?.[packageName];
    if (range) {
      buckets.push(bucket);
      ranges[bucket] = range;
    }
  }

  const duplicate = buckets.length > 1;
  const diagnostics: Diagnostic[] = duplicate
    ? [
        {
          level: "warning",
          code: "duplicate-declaration",
          message: `Package is declared in multiple dependency buckets: ${buckets.join(", ")}.`,
        },
      ]
    : [];

  return {
    declaration: {
      isDeclared: buckets.length > 0,
      buckets,
      primaryBucket: buckets[0] ?? null,
      ranges,
      duplicate,
    },
    diagnostics,
  };
}
