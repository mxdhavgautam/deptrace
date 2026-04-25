import type {
  ConfigMatch,
  DeclarationInfo,
  ImportRecord,
  RuntimeSignal,
  ScriptMatch,
  Verdict,
} from "../types.js";

export function getVerdict(input: {
  declaration: DeclarationInfo;
  imports: ImportRecord[];
  scripts: ScriptMatch[];
  configs: ConfigMatch[];
  runtimeSignals: RuntimeSignal[];
}): Verdict {
  const { declaration, imports, scripts, configs, runtimeSignals } = input;
  const reliableConfigs = configs.filter((config) => !(config.kind === "raw-text" && config.confidence === "low"));
  const hasOnlyLowConfidenceConfigMatches =
    imports.length === 0 && scripts.length === 0 && configs.length > 0 && reliableConfigs.length === 0;
  const hasUsage = imports.length > 0 || scripts.length > 0 || reliableConfigs.length > 0;
  const hasRuntimeSourceImports = imports.some((record) => record.fileCategory === "source" && !record.isTypeOnly);
  const hasRuntimeUnknownImports = imports.some((record) => record.fileCategory === "unknown" && !record.isTypeOnly);
  const hasOnlyTypeImports = imports.length > 0 && imports.every((record) => record.isTypeOnly);
  const hasToolingOnlyUsage =
    hasUsage &&
    !hasRuntimeSourceImports &&
    !hasRuntimeUnknownImports &&
    imports.every((record) => record.isTypeOnly || ["test", "config", "script", "tooling", "declaration"].includes(record.fileCategory));
  const inDependencies = declaration.buckets.includes("dependencies");
  const inDevDependencies = declaration.buckets.includes("devDependencies");
  const inPeerDependencies = declaration.buckets.includes("peerDependencies");
  const inOptionalDependencies = declaration.buckets.includes("optionalDependencies");

  if (hasOnlyLowConfidenceConfigMatches) {
    return {
      code: "INSPECT",
      confidence: "low",
      reasons: ["Only low-confidence raw config text matches were found."],
      nextSteps: ["Review the matched config text before treating it as real dependency usage."],
    };
  }

  if (!declaration.isDeclared && hasUsage) {
    return {
      code: "INSPECT",
      confidence: "medium",
      reasons: ["Package usage was detected, but it is not declared in package.json."],
      nextSteps: ["Check whether the package is supplied by a workspace, framework, or missing declaration."],
    };
  }

  if (hasRuntimeSourceImports) {
    const replacement = replacementVerdict(imports, runtimeSignals);
    if (replacement) {
      return replacement;
    }

    return {
      code: "KEEP",
      confidence: "high",
      reasons: ["Runtime source imports were found."],
      nextSteps: ["Keep the dependency unless the usage is intentionally being refactored."],
    };
  }

  if (hasRuntimeUnknownImports) {
    return {
      code: "KEEP",
      confidence: "medium",
      reasons: ["Runtime imports were found in files deptrace could not confidently classify."],
      nextSteps: ["Keep the dependency unless those unclassified files are known to be disposable tooling."],
    };
  }

  if (hasOnlyTypeImports) {
    if (inDependencies) {
      return {
        code: "MOVE_TO_DEV_CANDIDATE",
        confidence: "medium",
        reasons: ["Only type-level usage was detected, and the package is declared in dependencies."],
        nextSteps: ["Move it to devDependencies if it is not needed at runtime, then run install, typecheck, tests, and build."],
      };
    }

    return {
      code: "INSPECT",
      confidence: "medium",
      reasons: ["Only type-level usage was detected."],
      nextSteps: ["Confirm whether the package is needed at runtime or only for TypeScript types."],
    };
  }

  if (hasToolingOnlyUsage) {
    if (inDependencies) {
      return {
        code: "MOVE_TO_DEV_CANDIDATE",
        confidence: "medium",
        reasons: ["Usage was found only in tests, config, scripts, or tooling, while the package is declared in dependencies."],
        nextSteps: ["Move it to devDependencies and run install, typecheck, tests, and build."],
      };
    }

    return {
      code: "KEEP",
      confidence: inDevDependencies ? "high" : "medium",
      reasons: ["Usage was found in tests, config, scripts, or tooling."],
      nextSteps: ["Keep it in devDependencies unless the tooling usage is removed."],
    };
  }

  if (!hasUsage) {
    if (inPeerDependencies) {
      return {
        code: "INSPECT",
        confidence: "medium",
        reasons: ["No usage was detected, but the package is declared as a peer dependency."],
        nextSteps: ["Check whether this peer dependency is part of the package compatibility contract before removing it."],
      };
    }

    if (inOptionalDependencies) {
      return {
        code: "INSPECT",
        confidence: "low",
        reasons: ["No usage was detected, but optional dependencies are often loaded conditionally or dynamically."],
        nextSteps: ["Inspect runtime paths before changing optionalDependencies."],
      };
    }

    if (inDependencies || inDevDependencies) {
      return {
        code: "REMOVE_CANDIDATE",
        confidence: "medium",
        reasons: ["No source, test, config, or script usage was detected."],
        nextSteps: ["Remove it in a branch and run install, typecheck, tests, and build."],
      };
    }

    return {
      code: "UNKNOWN",
      confidence: "low",
      reasons: ["The package is not declared and no usage was detected."],
      nextSteps: ["Check the package name and selected --cwd."],
    };
  }

  return {
    code: "INSPECT",
    confidence: "low",
    reasons: ["Usage was detected, but it did not fit a high-confidence verdict rule."],
    nextSteps: ["Review the evidence in the report before changing package.json."],
  };
}

function replacementVerdict(imports: ImportRecord[], runtimeSignals: RuntimeSignal[]): Verdict | null {
  const runtimeImports = imports.filter((record) => !record.isTypeOnly);
  const allLodash = runtimeImports.every((record) => record.packageName === "lodash");
  const narrowSymbols = new Set(["get", "isNil", "noop"]);
  const usedSymbols = runtimeImports.flatMap((record) => record.symbols);
  const allNarrow = usedSymbols.length > 0 && usedSymbols.every((symbol) => narrowSymbols.has(symbol));

  if (!allLodash || !allNarrow) {
    return null;
  }

  const hasBrowserSignal = runtimeSignals.some((signal) => signal.kind === "browser-likely" || signal.kind === "client-directive");

  return {
    code: "REPLACE_OR_SHRINK",
    confidence: hasBrowserSignal ? "medium" : "low",
    reasons: ["Only narrow lodash helper usage was detected."],
    nextSteps: ["Inspect whether native syntax or a tiny local helper can replace this usage."],
  };
}
