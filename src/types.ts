export type Confidence = "high" | "medium" | "low";

export type DiagnosticLevel = "info" | "warning" | "error";

export type Diagnostic = {
  level: DiagnosticLevel;
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
};

export type ToolInfo = {
  name: "deptrace";
  version: string;
};

export type TargetInfo = {
  raw: string;
  packageName: string;
  subpath: string | null;
  normalized: boolean;
};

export type DependencyBucket =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export type DeclarationInfo = {
  isDeclared: boolean;
  buckets: DependencyBucket[];
  primaryBucket: DependencyBucket | null;
  ranges: Partial<Record<DependencyBucket, string>>;
  duplicate: boolean;
};

export type InstallationInfo = {
  installed: boolean;
  version: string | null;
  lockfileVersion: string | null;
  packageJsonPath: string | null;
  binNames: string[];
};

export type FileCategory =
  | "source"
  | "test"
  | "config"
  | "script"
  | "tooling"
  | "declaration"
  | "unknown";

export type ImportKind =
  | "esm-default-import"
  | "esm-named-import"
  | "esm-namespace-import"
  | "esm-side-effect-import"
  | "cjs-require"
  | "cjs-destructured-require"
  | "dynamic-import"
  | "re-export"
  | "ts-import-equals"
  | "require-resolve"
  | "jest-mock"
  | "vi-mock"
  | "jest-require-actual"
  | "triple-slash-reference";

export type ImportRecord = {
  file: string;
  line: number;
  column: number;
  specifier: string;
  packageName: string;
  subpath: string | null;
  kind: ImportKind;
  symbols: string[];
  isTypeOnly: boolean;
  fileCategory: FileCategory;
  code: string;
};

export type ScriptMatch = {
  scriptName: string;
  command: string;
  matchedToken: string;
  matchKind: "package-name" | "bin";
  confidence: Confidence;
};

export type ConfigMatchKind =
  | "literal"
  | "plugin-alias"
  | "tsconfig-types"
  | "triple-slash-reference"
  | "raw-text";

export type ConfigMatch = {
  file: string;
  line?: number;
  column?: number;
  kind: ConfigMatchKind;
  matched: string;
  packageName: string;
  confidence: Confidence;
  fileCategory: FileCategory;
};

export type RuntimeSignal = {
  kind: "browser-likely" | "server-likely" | "client-directive" | "unknown";
  confidence: Confidence;
  file: string;
  reason: string;
};

export type UsageSummary = {
  sourceFiles: number;
  testFiles: number;
  configFiles: number;
  scriptMatches: number;
  typeOnlyImports: number;
  runtimeImports: number;
  totalImportRecords: number;
  filesWithImports: number;
};

export type VerdictCode =
  | "KEEP"
  | "REMOVE_CANDIDATE"
  | "MOVE_TO_DEV_CANDIDATE"
  | "REPLACE_OR_SHRINK"
  | "INSPECT"
  | "UNKNOWN";

export type Verdict = {
  code: VerdictCode;
  confidence: Confidence;
  reasons: string[];
  nextSteps: string[];
};

export type ScanMetadata = {
  cwd: string;
  filesScanned: number;
  filesSkipped: number;
  skippedReasons: Record<string, number>;
  durationMs: number;
  parser: "babel";
  workspace: {
    detected: boolean;
    markers: string[];
    childWorkspacePatterns: string[];
  };
};

export type DeptraceReport = {
  schemaVersion: 1;
  tool: ToolInfo;
  target: TargetInfo;
  package: {
    projectName: string | null;
    packageName: string;
  };
  declaration: DeclarationInfo;
  installation: InstallationInfo;
  usage: UsageSummary;
  imports: ImportRecord[];
  scripts: ScriptMatch[];
  configs: ConfigMatch[];
  runtimeSignals: RuntimeSignal[];
  verdict: Verdict;
  diagnostics: Diagnostic[];
  scan: ScanMetadata;
};

export type PackageJson = {
  name?: string;
  version?: string;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  compilerOptions?: {
    types?: string[];
  };
};
