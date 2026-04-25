import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { analyzeDependency } from "../src/analyze.js";
import { normalizeTarget } from "../src/package/target.js";
import { tokenizeShellish } from "../src/scripts/scanScripts.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const fixture = (name: string) => path.join(root, "fixtures", name);

describe("target normalization", () => {
  it("normalizes package subpaths", () => {
    expect(normalizeTarget("lodash/get")).toEqual({
      raw: "lodash/get",
      packageName: "lodash",
      subpath: "get",
      normalized: true,
    });
  });

  it("normalizes scoped package subpaths", () => {
    expect(normalizeTarget("@scope/pkg/foo")).toEqual({
      raw: "@scope/pkg/foo",
      packageName: "@scope/pkg",
      subpath: "foo",
      normalized: true,
    });
  });
});

describe("script tokenization", () => {
  it("keeps command tokens exact instead of substring matching", () => {
    expect(tokenizeShellish("cross-env NODE_ENV=production tsc -p tsconfig.json && vite --host")).toContain("tsc");
    expect(tokenizeShellish("eslint-config-next")).toEqual(["eslint-config-next"]);
  });
});

describe("analyzeDependency", () => {
  it("explains a declared package with import locations and installed version", async () => {
    const report = await analyzeDependency({
      cwd: fixture("basic"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.declaration.buckets).toEqual(["dependencies"]);
    expect(report.installation.version).toBe("4.17.21");
    expect(report.imports).toHaveLength(2);
    expect(report.imports.map((record) => record.symbols[0]).sort()).toEqual(["debounce", "get"]);
    expect(report.imports[0]).toMatchObject({ file: "src/components/SearchBox.tsx", line: 3 });
    expect(report.runtimeSignals).toContainEqual(
      expect.objectContaining({
        kind: "client-directive",
        confidence: "high",
      }),
    );
    expect(report.verdict.code).toBe("KEEP");
  });

  it("filters a normalized subpath target to matching subpath or symbol evidence", async () => {
    const report = await analyzeDependency({
      cwd: fixture("basic"),
      target: "lodash/get",
      toolVersion: "0.1.0-test",
    });

    expect(report.target).toMatchObject({
      packageName: "lodash",
      subpath: "get",
      normalized: true,
    });
    expect(report.imports).toHaveLength(1);
    expect(report.imports[0]).toMatchObject({
      specifier: "lodash/get",
      symbols: ["get"],
    });
  });

  it("detects tsconfig type usage as config usage", async () => {
    const report = await analyzeDependency({
      cwd: fixture("basic"),
      target: "@types/node",
      toolVersion: "0.1.0-test",
    });

    expect(report.configs).toContainEqual(
      expect.objectContaining({
        file: "tsconfig.json",
        kind: "tsconfig-types",
        matched: "node",
        confidence: "high",
      }),
    );
    expect(report.verdict.code).toBe("MOVE_TO_DEV_CANDIDATE");
  });

  it("AST-scans JS/TS config files so type-only config imports keep line evidence", async () => {
    const report = await analyzeDependency({
      cwd: fixture("config-type-import"),
      target: "tailwindcss",
      toolVersion: "0.1.0-test",
    });

    expect(report.imports).toContainEqual(
      expect.objectContaining({
        file: "tailwind.config.ts",
        line: 1,
        column: 1,
        kind: "esm-named-import",
        isTypeOnly: true,
        fileCategory: "config",
      }),
    );
    expect(report.usage.typeOnlyImports).toBe(1);
    expect(report.verdict.code).toBe("MOVE_TO_DEV_CANDIDATE");
  });

  it("detects package bin usage in scripts", async () => {
    const report = await analyzeDependency({
      cwd: fixture("scripts-only"),
      target: "typescript",
      toolVersion: "0.1.0-test",
    });

    expect(report.scripts).toEqual([
      expect.objectContaining({
        scriptName: "build",
        matchedToken: "tsc",
        matchKind: "bin",
      }),
    ]);
    expect(report.verdict.code).toBe("MOVE_TO_DEV_CANDIDATE");
  });

  it("matches scoped package names exactly in scripts before path basename normalization", async () => {
    const report = await analyzeDependency({
      cwd: fixture("scoped-script"),
      target: "@scope/pkg",
      toolVersion: "0.1.0-test",
    });

    expect(report.scripts).toEqual([
      expect.objectContaining({
        scriptName: "use",
        matchedToken: "@scope/pkg",
        matchKind: "package-name",
      }),
    ]);
    expect(report.verdict.code).toBe("MOVE_TO_DEV_CANDIDATE");
  });

  it("keeps node_modules installation version separate from lockfile-only evidence", async () => {
    const report = await analyzeDependency({
      cwd: fixture("lockfile-only"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.installation).toMatchObject({
      installed: false,
      version: null,
      lockfileVersion: "4.17.21",
    });
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "package-not-installed",
        message: expect.stringContaining("package-lock.json contains version 4.17.21"),
      }),
    );
  });

  it("detects duplicate declarations and keeps peer/optional no-usage verdicts cautious", async () => {
    const duplicate = await analyzeDependency({
      cwd: fixture("verdict-buckets"),
      target: "duplicate-pkg",
      toolVersion: "0.1.0-test",
    });
    const peer = await analyzeDependency({
      cwd: fixture("verdict-buckets"),
      target: "peer-pkg",
      toolVersion: "0.1.0-test",
    });
    const optional = await analyzeDependency({
      cwd: fixture("verdict-buckets"),
      target: "optional-pkg",
      toolVersion: "0.1.0-test",
    });

    expect(duplicate.declaration).toMatchObject({
      duplicate: true,
      buckets: ["dependencies", "devDependencies"],
    });
    expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-declaration" }));
    expect(peer.verdict.code).toBe("INSPECT");
    expect(optional.verdict).toMatchObject({ code: "INSPECT", confidence: "low" });
  });

  it("detects planned AST forms and reports computed dynamic usage as diagnostics only", async () => {
    const report = await analyzeDependency({
      cwd: fixture("ast-forms"),
      target: "pkg",
      toolVersion: "0.1.0-test",
    });

    expect(report.imports.map((record) => record.kind)).toEqual(
      expect.arrayContaining([
        "esm-named-import",
        "re-export",
        "ts-import-equals",
        "require-resolve",
        "jest-mock",
        "vi-mock",
        "jest-require-actual",
        "dynamic-import",
      ]),
    );
    expect(report.imports).toContainEqual(expect.objectContaining({ specifier: "pkg/dynamic", kind: "dynamic-import" }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: "computed-import" }));
  });

  it("ignores invalid unrelated bare specifiers instead of crashing analysis", async () => {
    const report = await analyzeDependency({
      cwd: fixture("invalid-specifier"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.imports).toContainEqual(
      expect.objectContaining({
        specifier: "lodash",
        symbols: ["debounce"],
      }),
    );
  });

  it("detects package-derived config plugin aliases", async () => {
    const report = await analyzeDependency({
      cwd: fixture("config-alias"),
      target: "eslint-plugin-react",
      toolVersion: "0.1.0-test",
    });

    expect(report.configs).toContainEqual(
      expect.objectContaining({
        file: ".eslintrc.json",
        kind: "plugin-alias",
        matched: "react",
        confidence: "medium",
      }),
    );
    expect(report.verdict.code).toBe("KEEP");
  });

  it("does not let low-confidence unknown rc text produce a strong dependency verdict", async () => {
    const report = await analyzeDependency({
      cwd: fixture("unknown-rc"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.configs).toContainEqual(
      expect.objectContaining({
        file: ".npmrc",
        kind: "raw-text",
        confidence: "low",
      }),
    );
    expect(report.verdict).toMatchObject({
      code: "INSPECT",
      confidence: "low",
    });
  });

  it("warns at workspace roots and ignores child package source by default", async () => {
    const report = await analyzeDependency({
      cwd: fixture("workspace-root"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.scan.workspace.detected).toBe(true);
    expect(report.imports).toHaveLength(0);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "workspace-root-detected",
      }),
    );
  });

  it("uses default child package ignores for marker-only workspace roots", async () => {
    const report = await analyzeDependency({
      cwd: fixture("workspace-marker-only"),
      target: "lodash",
      toolVersion: "0.1.0-test",
    });

    expect(report.scan.workspace.detected).toBe(true);
    expect(report.scan.workspace.childWorkspacePatterns).toEqual(["apps/*", "packages/*"]);
    expect(report.imports).toHaveLength(0);
  });

  it("keeps runtime imports found in unclassified files instead of treating them as tooling-only", async () => {
    const report = await analyzeDependency({
      cwd: fixture("unknown-runtime"),
      target: "left-pad",
      toolVersion: "0.1.0-test",
    });

    expect(report.imports).toHaveLength(1);
    expect(report.imports[0]).toMatchObject({
      file: "root-entry.ts",
      fileCategory: "unknown",
    });
    expect(report.verdict).toMatchObject({
      code: "KEEP",
      confidence: "medium",
    });
  });
});

describe("CLI", () => {
  it("prints clean JSON to stdout", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      path.join(root, "src/cli.ts"),
      "lodash",
      "--json",
      "--cwd",
      fixture("basic"),
    ]);

    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.imports).toHaveLength(2);
  });

  it("exits 2 for invalid CLI input", async () => {
    await expect(execFileAsync(process.execPath, ["--import", "tsx", path.join(root, "src/cli.ts")])).rejects.toMatchObject({
      code: 2,
    });
  });

  it("exits 2 for malformed package.json", async () => {
    await expect(
      execFileAsync(process.execPath, [
        "--import",
        "tsx",
        path.join(root, "src/cli.ts"),
        "lodash",
        "--cwd",
        fixture("bad-package-json"),
      ]),
    ).rejects.toMatchObject({
      code: 2,
    });
  });
});
