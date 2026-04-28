![deptrace preview banner](deptrace-preview.jpg)
# deptrace

Explain where a JavaScript or TypeScript dependency is used.

Package managers can tell you why a package is installed. `deptrace` tells you
where your codebase actually uses it, which symbols or subpaths are imported,
whether it appears in scripts/config, and what a cautious next step might be.

The npm package is scoped because the unscoped `deptrace` name is already taken.


## Quick Start (without installation)

```bash
npx @mxdhavgautam/deptrace <package-name> --cwd /path/to/project
```


## Installation (Optional)
For a project:
```bash
npm i -D @mxdhavgautam/deptrace
```
and then use with:
```bash
npm exec -- deptrace <package-name>
```

Or globally:
```bash
npm i -g @mxdhavgautam/deptrace
```
and then use with:
```bash
deptrace <package-name> --cwd /path/to/project
```
or run in any project root:
```bash
cd /path/to/project
deptrace <package-name>
deptrace <package-name> --json
```


## Usage Examples
After installing globally or running through `npm exec`, the CLI accepts:
```bash
deptrace <package-name>
deptrace <package-name> --json
deptrace <package-name> --cwd ../some-project
deptrace @scope/pkg/subpath
```


## Complete Examples
### Keep Package:
Command:
```bash
deptrace razorpay
```
Output:
```txt
razorpay@2.9.6

Package
  status: direct dependency
  declared in: dependencies
  version range: dependencies ^2.9.6
  installed: 2.9.6

Usage Summary
  source files: 1
  test files: 1
  config files: 0
  script matches: 0
  type-only imports: 0

Imports
  src/lib/razorpay.ts:3
    default from razorpay (esm-default-import, source)
    import Razorpay from "razorpay";
  src/lib/razorpay.ts:4
    validatePaymentVerification from razorpay/dist/utils/razorpay-utils (esm-named-import, source)
    import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";
  tests/lib/razorpay.test.ts:10
    (side effect) from razorpay (vi-mock, test)
    vi.mock("razorpay", () => {
  tests/lib/razorpay.test.ts:24
    razorpay-utils from razorpay/dist/utils/razorpay-utils (vi-mock, test)
    vi.mock("razorpay/dist/utils/razorpay-utils", () => ({

Script Usage
  none detected

Config Usage
  none detected

Runtime Signal
  none detected

Verdict
  KEEP
  confidence: high
  reasons:
    - Runtime source imports were found.
  next steps:
    - Keep the dependency unless the usage is intentionally being refactored.
```

### Removal Candidate:
Command:
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


## v0.1 Scope

`deptrace` v0.1 is intentionally narrow. It explains one dependency in one
selected JS/TS package root using local evidence:

- declaration bucket in `package.json`
- installed package metadata from `node_modules`
- source imports, requires, re-exports, dynamic string imports, and type-only imports
- package script matches, including installed package binary names

And outputs them alongside:
- config matches with confidence levels
- workspace-root warnings
- cautious verdicts like `KEEP`, `REMOVE_CANDIDATE`, `MOVE_TO_DEV_CANDIDATE`, and `INSPECT`

It does not yet implement `--all`, `--unused`, `--ci`, pruning, full workspace
analysis, or bundle inspection.
