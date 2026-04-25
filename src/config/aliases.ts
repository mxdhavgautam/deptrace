export function derivePackageAliases(packageName: string): string[] {
  const aliases = new Set<string>();
  const unscoped = packageName.split("/").at(-1) ?? packageName;

  if (packageName === "@typescript-eslint/eslint-plugin") {
    aliases.add("@typescript-eslint");
  }

  if (unscoped.startsWith("eslint-plugin-")) {
    aliases.add(unscoped.replace(/^eslint-plugin-/, ""));
  }

  if (unscoped.startsWith("prettier-plugin-")) {
    aliases.add(unscoped.replace(/^prettier-plugin-/, ""));
  }

  if (unscoped.startsWith("babel-plugin-")) {
    aliases.add(unscoped.replace(/^babel-plugin-/, ""));
  }

  if (unscoped.startsWith("postcss-")) {
    aliases.add(unscoped.replace(/^postcss-/, ""));
  }

  if (unscoped.endsWith("-loader")) {
    aliases.add(unscoped.replace(/-loader$/, ""));
  }

  return [...aliases].filter(Boolean).sort();
}
