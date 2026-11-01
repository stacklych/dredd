---
name: run-dredd
description: Build, run, and smoke-test the Dredd HTTP API testing CLI. Use when asked to run, start, build, test, or screenshot Dredd, or to confirm a change to the dredd CLI / dredd-transactions works in the real binary (parsing API descriptions, compiling transactions, validating a backend).
---

# Run Dredd

Dredd is a language-agnostic command-line tool that validates an API description
document (OpenAPI 3.0, 3.1 or 3.2) against a backend
implementation. It is a **CLI tool**, not a server — you drive it by invoking
the binary with `<description> <server-url> [options]`.

This repo is a Yarn-workspaces monorepo with two packages:
`packages/dredd` (the CLI) and `packages/dredd-transactions` (its parser/compiler
library, plain JS — no build step). The CLI binary is
`packages/dredd/bin/dredd`, which requires the TypeScript-compiled
`packages/dredd/build/`.

The agent path is the driver at
[.claude/skills/run-dredd/driver.mjs](.claude/skills/run-dredd/driver.mjs): it
boots the binary, dry-run-compiles the OpenAPI 3.0 and 3.1 fixtures it bundles, and runs a live pass/fail validation against a throwaway Node backend.

**All paths below are relative to the repo root** (the directory containing this
`packages/` folder).

## Prerequisites

- Node.js **>= 22.22.2** (`engines.node` in both packages). CI tests 22.x and
  24.x.
- Yarn 1.x (classic). The repo uses Yarn workspaces; npm will not link the
  workspaces correctly. If `yarn` isn't installed, `corepack yarn ...` works.

## Build

```bash
yarn install
yarn build
```

`yarn build` runs `scripts/run-workspaces.mjs build`, which runs each
workspace's `build` script: `tsc --build` for `packages/dredd`
(dredd-transactions' build is a no-op; it ships as plain JS). Output lands in
`packages/dredd/build/`.

## Run (agent path) — the driver

From the repo root:

```bash
node .claude/skills/run-dredd/driver.mjs          # full smoke, exits non-zero on failure
node .claude/skills/run-dredd/driver.mjs version  # binary boots, prints version
node .claude/skills/run-dredd/driver.mjs formats  # dry-run oas3.0 / oas3.1 fixtures
node .claude/skills/run-dredd/driver.mjs e2e       # live backend: pass + fail validation
node .claude/skills/run-dredd/driver.mjs run <desc> <server-url> [dredd opts...]  # passthrough
```

Expected full-smoke output (in an environment that permits TCP `listen()`):

```
dredd CLI smoke
--------------
  PASS  cli --version boots and exits 0
  PASS  dry-run compiles OpenAPI 3.0
  PASS  dry-run compiles OpenAPI 3.1
  PASS  live validation passes against conforming backend
  PASS  live validation fails against non-conforming backend
--------------
5 passed, 0 failed
```

The `e2e` check **auto-skips** with a clear message if the environment blocks
`listen()` (see Gotchas). `formats` exercises the parser + transaction compiler
end-to-end without any network, so it always runs.

## Run (human path) — the raw CLI

```bash
node packages/dredd/bin/dredd --version
node packages/dredd/bin/dredd --help
# Parse + compile, no HTTP:
node packages/dredd/bin/dredd packages/dredd/test/fixtures/single-get.yaml http://127.0.0.1:3000 --dry-run
# Real validation against a running backend:
node packages/dredd/bin/dredd ./api-description.yaml http://127.0.0.1:3000
```

Exit code is `0` when all transactions pass (or all are skipped in `--dry-run`),
`1` on any failure, error, missing description file, or connection refused.

## Test

```bash
cd packages/dredd
npm run test:unit          # unit suite
npm run test:integration   # integration suite; run it after the unit suite,
                           # not in parallel (both bind the same ports)
npm run e2e                # Cucumber end-to-end tests
cd ../dredd-transactions
npm test                   # parser/compiler suite
```

The integration and e2e suites bind local servers and need an environment
that permits `listen()` (see Gotchas).

## Gotchas

- **TCP `listen()` may be blocked.** In a sandboxed shell, binding any server
  socket fails with `EPERM` (`listen EPERM 127.0.0.1:...`). This blocks the
  live `e2e` driver check and all package-level integration/e2e tests — none
  of which is a code defect. The driver's `formats`/`version`/`dry-run` paths
  need no listener and always run.
- **Proxy env warning.** If `HTTP_PROXY`/`HTTPS_PROXY` are set, Dredd prints a
  proxy warning on every run. Harmless for `127.0.0.1` targets as long as
  `NO_PROXY` covers localhost. The driver filters this line from its output.
- **dredd-transactions has no build artifact.** Its `build` script is `exit 0`
  and `main` is `index.js` — it runs from source. Don't expect a `build/` dir
  there.

## Troubleshooting

- `packages/dredd/build/CLI.js missing` → run `yarn build`. The driver exits 2
  with this message if the CLI wasn't compiled.
- `error: API description parser error ... unknown escape sequence` → malformed
  description document (e.g. bad YAML), not a Dredd bug. Validate against a
  known-good fixture under `packages/dredd/test/fixtures/`.
- `corepack` cannot download Yarn (`EPERM mkdir ~/.cache/node/corepack`) →
  point its cache somewhere writable: `export COREPACK_HOME="$TMPDIR/corepack"`.
- `yarn install` aborts on `EPERM mkdir .../.idea/...` or
  `copyfile .../.gitmodules` → the sandbox forbids creating VCS/IDE-metadata
  files that some dependency tarballs ship. Strip them from Yarn's cache and
  re-run, e.g.:
  `find "$(yarn cache dir)" \( -name .idea -o -name .gitmodules -o -name .git \) -exec rm -rf {} +`
