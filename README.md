# deptrace

Explain where a JavaScript or TypeScript dependency is used.

Package managers can tell you why a package is installed. `deptrace` tells you
where your codebase actually uses it, which symbols or subpaths are imported,
whether it appears in scripts/config, and what a cautious next step might be.

The npm package is scoped because the unscoped `deptrace` name is already taken:

```bash
npx @mxdhavgautam/deptrace
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

```txt
lodash@4.17.21

Package
  status: direct dependency
  declared in: dependencies
  version range: dependencies ^4.17.21
  installed: 4.17.21

Usage Summary
  source files: 2
  test files: 0
  config files: 0
  script matches: 0
  type-only imports: 0

Imports
  src/components/SearchBox.tsx:3
    debounce from lodash (esm-named-import, source)
    import { debounce } from "lodash";
```

## JSON

`--json` prints exactly one JSON object to stdout. Normal diagnostics are inside
the report object; stderr is reserved for fatal errors before a report can be
produced.
