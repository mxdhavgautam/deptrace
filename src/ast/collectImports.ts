import { readFile } from "node:fs/promises";
import { parse, type ParserPlugin } from "@babel/parser";
import type { Diagnostic, FileCategory, ImportKind, ImportRecord, TargetInfo } from "../types.js";
import { tryParseSpecifier, typeDirectiveToPackage } from "../package/target.js";
import { specifierMatchesTarget } from "../package/match.js";

type CollectResult = {
  imports: ImportRecord[];
  diagnostics: Diagnostic[];
};

export async function collectImportsForFile(
  file: string,
  absolutePath: string,
  category: FileCategory,
  target: TargetInfo,
): Promise<CollectResult> {
  const code = await readFile(absolutePath, "utf8");
  const imports: ImportRecord[] = [];
  const diagnostics: Diagnostic[] = [];

  imports.push(...collectTripleSlashReferences(file, code, category, target));

  let ast: any;
  try {
    ast = parse(code, {
      sourceType: "unambiguous",
      errorRecovery: true,
      plugins: getParserPlugins(file) as any,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({
      level: "warning",
      code: "parse-error",
      message: `Could not parse ${file}: ${message}`,
      file,
    });
    return { imports, diagnostics };
  }

  for (const parseError of ast.errors ?? []) {
    diagnostics.push({
      level: "warning",
      code: "parse-error",
      message: parseError.message,
      file,
      line: parseError.loc?.line,
      column: parseError.loc?.column !== undefined ? parseError.loc.column + 1 : undefined,
    });
  }

  walk(ast.program, null, (node, parent) => {
    collectNodeUsage(node, parent, file, category, code, target, imports, diagnostics);
  });

  return { imports, diagnostics };
}

function collectNodeUsage(
  node: any,
  parent: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
  diagnostics: Diagnostic[],
): void {
  switch (node.type) {
    case "ImportDeclaration":
      addImportDeclaration(node, file, category, code, target, imports);
      return;
    case "ExportNamedDeclaration":
    case "ExportAllDeclaration":
      addExportDeclaration(node, file, category, code, target, imports);
      return;
    case "TSImportEqualsDeclaration":
      addTsImportEquals(node, file, category, code, target, imports);
      return;
    case "CallExpression":
      addCallExpression(node, parent, file, category, code, target, imports, diagnostics);
      return;
  }
}

function addImportDeclaration(
  node: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
): void {
  const specifier = node.source?.value;
  if (typeof specifier !== "string" || !isBareSpecifier(specifier)) {
    return;
  }

  const parsed = tryParseSpecifier(specifier);
  if (!parsed) {
    return;
  }
  const symbols = importSymbols(node, parsed.subpath);
  if (!specifierMatchesTarget(parsed.packageName, parsed.subpath, symbols, target)) {
    return;
  }

  imports.push(
    toRecord({
      node,
      file,
      category,
      code,
      specifier,
      packageName: parsed.packageName,
      subpath: parsed.subpath,
      kind: importKind(node),
      symbols,
      isTypeOnly: isTypeOnlyImport(node),
    }),
  );
}

function addExportDeclaration(
  node: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
): void {
  const specifier = node.source?.value;
  if (typeof specifier !== "string" || !isBareSpecifier(specifier)) {
    return;
  }

  const parsed = tryParseSpecifier(specifier);
  if (!parsed) {
    return;
  }
  const symbols = exportSymbols(node, parsed.subpath);
  if (!specifierMatchesTarget(parsed.packageName, parsed.subpath, symbols, target)) {
    return;
  }

  imports.push(
    toRecord({
      node,
      file,
      category,
      code,
      specifier,
      packageName: parsed.packageName,
      subpath: parsed.subpath,
      kind: "re-export",
      symbols,
      isTypeOnly: isTypeOnlyExport(node),
    }),
  );
}

function addTsImportEquals(
  node: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
): void {
  const specifier = node.moduleReference?.expression?.value;
  if (typeof specifier !== "string" || !isBareSpecifier(specifier)) {
    return;
  }

  const parsed = tryParseSpecifier(specifier);
  if (!parsed) {
    return;
  }
  const symbols = node.id?.name ? [node.id.name] : [];
  if (!specifierMatchesTarget(parsed.packageName, parsed.subpath, symbols, target)) {
    return;
  }

  imports.push(
    toRecord({
      node,
      file,
      category,
      code,
      specifier,
      packageName: parsed.packageName,
      subpath: parsed.subpath,
      kind: "ts-import-equals",
      symbols,
      isTypeOnly: false,
    }),
  );
}

function addCallExpression(
  node: any,
  parent: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
  diagnostics: Diagnostic[],
): void {
  if (isIdentifier(node.callee, "require")) {
    const specifier = stringArg(node);
    if (!specifier) {
      diagnostics.push(dynamicDiagnostic(node, file, "computed-require", "Computed require() call found; static analysis cannot attribute it to a package."));
      return;
    }
    addCallSpecifier(node, parent, file, category, code, target, imports, specifier, requireKind(parent), requireSymbols(parent));
    return;
  }

  if (node.callee?.type === "Import") {
    const specifier = stringArg(node);
    if (!specifier) {
      diagnostics.push(dynamicDiagnostic(node, file, "computed-import", "Computed import() call found; static analysis cannot attribute it to a package."));
      return;
    }
    addCallSpecifier(node, parent, file, category, code, target, imports, specifier, "dynamic-import", []);
    return;
  }

  if (isMemberCall(node.callee, "require", "resolve")) {
    const specifier = stringArg(node);
    if (specifier) {
      addCallSpecifier(node, parent, file, category, code, target, imports, specifier, "require-resolve", []);
    }
    return;
  }

  if (isMemberCall(node.callee, "jest", "mock")) {
    const specifier = stringArg(node);
    if (specifier) {
      addCallSpecifier(node, parent, file, category, code, target, imports, specifier, "jest-mock", []);
    }
    return;
  }

  if (isMemberCall(node.callee, "vi", "mock")) {
    const specifier = stringArg(node);
    if (specifier) {
      addCallSpecifier(node, parent, file, category, code, target, imports, specifier, "vi-mock", []);
    }
    return;
  }

  if (isMemberCall(node.callee, "jest", "requireActual")) {
    const specifier = stringArg(node);
    if (specifier) {
      addCallSpecifier(node, parent, file, category, code, target, imports, specifier, "jest-require-actual", []);
    }
  }
}

function addCallSpecifier(
  node: any,
  parent: any,
  file: string,
  category: FileCategory,
  code: string,
  target: TargetInfo,
  imports: ImportRecord[],
  specifier: string,
  kind: ImportKind,
  symbols: string[],
): void {
  if (!isBareSpecifier(specifier)) {
    return;
  }

  const parsed = tryParseSpecifier(specifier);
  if (!parsed) {
    return;
  }
  const effectiveSymbols = symbols.length > 0 ? symbols : subpathSymbol(parsed.subpath);
  if (!specifierMatchesTarget(parsed.packageName, parsed.subpath, effectiveSymbols, target)) {
    return;
  }

  imports.push(
    toRecord({
      node,
      file,
      category,
      code,
      specifier,
      packageName: parsed.packageName,
      subpath: parsed.subpath,
      kind,
      symbols: effectiveSymbols,
      isTypeOnly: false,
    }),
  );
}

function collectTripleSlashReferences(
  file: string,
  code: string,
  category: FileCategory,
  target: TargetInfo,
): ImportRecord[] {
  const records: ImportRecord[] = [];
  const lines = code.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/\/\/\/\s*<reference\s+types=["']([^"']+)["']\s*\/>/);
    if (!match) {
      continue;
    }

    const specifier = match[1];
    const parsed = typeDirectiveToPackage(specifier);
    const symbols = [specifier];
    if (!specifierMatchesTarget(parsed.packageName, parsed.subpath, symbols, target)) {
      continue;
    }

    records.push({
      file,
      line: index + 1,
      column: line.indexOf(match[0]) + 1,
      specifier,
      packageName: parsed.packageName,
      subpath: parsed.subpath,
      kind: "triple-slash-reference",
      symbols,
      isTypeOnly: true,
      fileCategory: category,
      code: line.trim(),
    });
  }

  return records;
}

function toRecord(input: {
  node: any;
  file: string;
  category: FileCategory;
  code: string;
  specifier: string;
  packageName: string;
  subpath: string | null;
  kind: ImportKind;
  symbols: string[];
  isTypeOnly: boolean;
}): ImportRecord {
  const line = input.node.loc?.start?.line ?? 1;
  const column = input.node.loc?.start?.column !== undefined ? input.node.loc.start.column + 1 : 1;

  return {
    file: input.file,
    line,
    column,
    specifier: input.specifier,
    packageName: input.packageName,
    subpath: input.subpath,
    kind: input.kind,
    symbols: input.symbols,
    isTypeOnly: input.isTypeOnly,
    fileCategory: input.category,
    code: input.code.split(/\r?\n/)[line - 1]?.trim() ?? "",
  };
}

function importSymbols(node: any, subpath: string | null): string[] {
  const symbols: string[] = [];

  for (const specifier of node.specifiers ?? []) {
    if (specifier.type === "ImportSpecifier") {
      symbols.push(nameOf(specifier.imported));
    } else if (specifier.type === "ImportDefaultSpecifier") {
      symbols.push(...(subpathSymbol(subpath).length > 0 ? subpathSymbol(subpath) : ["default"]));
    } else if (specifier.type === "ImportNamespaceSpecifier") {
      symbols.push("*");
    }
  }

  return [...new Set(symbols.filter(Boolean))];
}

function exportSymbols(node: any, subpath: string | null): string[] {
  if (node.type === "ExportAllDeclaration") {
    return ["*"];
  }

  const symbols: string[] = (node.specifiers ?? [])
    .map((specifier: any) => nameOf(specifier.exported ?? specifier.local))
    .filter((symbol: string): symbol is string => Boolean(symbol));

  return [...new Set(symbols.length > 0 ? symbols : subpathSymbol(subpath))];
}

function requireSymbols(parent: any): string[] {
  if (parent?.type !== "VariableDeclarator") {
    return [];
  }

  if (parent.id?.type === "ObjectPattern") {
    return (parent.id.properties ?? [])
      .map((property: any) => nameOf(property.key ?? property.argument))
      .filter(Boolean);
  }

  if (parent.id?.type === "Identifier") {
    return [parent.id.name];
  }

  return [];
}

function requireKind(parent: any): ImportKind {
  return parent?.type === "VariableDeclarator" && parent.id?.type === "ObjectPattern"
    ? "cjs-destructured-require"
    : "cjs-require";
}

function importKind(node: any): ImportKind {
  if (!node.specifiers || node.specifiers.length === 0) {
    return "esm-side-effect-import";
  }

  if (node.specifiers.some((specifier: any) => specifier.type === "ImportSpecifier")) {
    return "esm-named-import";
  }

  if (node.specifiers.some((specifier: any) => specifier.type === "ImportNamespaceSpecifier")) {
    return "esm-namespace-import";
  }

  return "esm-default-import";
}

function isTypeOnlyImport(node: any): boolean {
  if (node.importKind === "type") {
    return true;
  }

  const specifiers = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((specifier: any) => specifier.importKind === "type");
}

function isTypeOnlyExport(node: any): boolean {
  if (node.exportKind === "type") {
    return true;
  }

  const specifiers = node.specifiers ?? [];
  return specifiers.length > 0 && specifiers.every((specifier: any) => specifier.exportKind === "type");
}

function subpathSymbol(subpath: string | null): string[] {
  return subpath ? [subpath.split("/").at(-1) ?? subpath] : [];
}

function nameOf(node: any): string {
  if (!node) {
    return "";
  }

  return node.name ?? node.value ?? "";
}

function stringArg(node: any): string | null {
  const arg = node.arguments?.[0];
  return typeof arg?.value === "string" ? arg.value : null;
}

function dynamicDiagnostic(node: any, file: string, code: string, message: string): Diagnostic {
  return {
    level: "info",
    code,
    message,
    file,
    line: node.loc?.start?.line,
    column: node.loc?.start?.column !== undefined ? node.loc.start.column + 1 : undefined,
  };
}

function isMemberCall(callee: any, objectName: string, propertyName: string): boolean {
  return (
    callee?.type === "MemberExpression" &&
    isIdentifier(callee.object, objectName) &&
    isIdentifier(callee.property, propertyName)
  );
}

function isIdentifier(node: any, name: string): boolean {
  return node?.type === "Identifier" && node.name === name;
}

function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("#");
}

function getParserPlugins(file: string): ParserPlugin[] {
  const plugins: ParserPlugin[] = ["importAssertions", "decorators-legacy", "classProperties", "topLevelAwait"];

  if (/\.(ts|tsx|mts|cts)$/.test(file)) {
    plugins.push(file.endsWith(".d.ts") ? ["typescript", { dts: true }] : "typescript");
  }

  if (/\.(jsx|tsx)$/.test(file)) {
    plugins.push("jsx");
  }

  return plugins;
}

function walk(node: any, parent: any, visitor: (node: any, parent: any) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (typeof node.type === "string") {
    visitor(node, parent);
  }

  for (const [key, value] of Object.entries(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "errors" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "innerComments"
    ) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, node, visitor);
      }
    } else {
      walk(value, node, visitor);
    }
  }
}
