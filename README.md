# deptrace

Explain where a JavaScript or TypeScript dependency is used.

Package managers can tell you why a package is installed. `deptrace` tells you
where your codebase actually uses it, which symbols or subpaths are imported,
whether it appears in scripts/config, and what a cautious next step might be.

The npm package is scoped because the unscoped `deptrace` name is already taken:

## Installation

```bash
npm i @mxdhavgautam/deptrace
```

## Usage

```bash
deptrace lodash
deptrace lodash --json
deptrace lodash --cwd ../some-project
deptrace lodash/get
deptrace @scope/pkg/subpath
```

## v0.1 Scope

`deptrace` v0.1 is intentionally narrow. It explains one dependency in one
selected JS/TS package root using local evidence:

- declaration bucket in `package.json`
- installed package metadata from `node_modules`
- source imports, requires, re-exports, dynamic string imports, and type-only imports
- package script matches, including installed package binary names
- config matches with confidence levels
- workspace-root warnings
- cautious verdicts like `KEEP`, `REMOVE_CANDIDATE`, `MOVE_TO_DEV_CANDIDATE`, and `INSPECT`

It does not yet implement `--all`, `--unused`, `--ci`, pruning, full workspace
analysis, or bundle inspection.

## Example

Ran Command:
```bash
deptrace bcryptjs
```
Output:
```txt
bcryptjs@3.0.3

Package
  status: direct dependency
  declared in: dependencies
  version range: dependencies ^3.0.3
  installed: 3.0.3

Usage Summary
  source files: 0
  test files: 0
  config files: 0
  script matches: 0
  type-only imports: 0

Imports
  none detected

Script Usage
  none detected

Config Usage
  none detected

Runtime Signal
  none detected

Verdict
  REMOVE_CANDIDATE
  confidence: medium
  reasons:
    - No source, test, config, or script usage was detected.
  next steps:
    - Remove it in a branch and run install, typecheck, tests, and build.
```

## JSON

`--json` prints exactly one JSON object to stdout. Normal diagnostics are inside
the report object; stderr is reserved for fatal errors before a report can be
produced.
