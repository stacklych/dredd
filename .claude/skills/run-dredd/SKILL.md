---
name: run-dredd
description: Build, run, and smoke-test the Dredd HTTP API testing CLI. Use when asked to run, start, build, test, or screenshot Dredd, or to confirm a change to the dredd CLI / dredd-transactions works in the real binary (parsing API descriptions, compiling transactions, validating a backend).
---

# Run Dredd

Dredd is a language-agnostic command-line tool that validates an API description
document (API Blueprint, OpenAPI 2, OpenAPI 3.1) against a backend
implementation. It is a **CLI tool**, not a server — you drive it by invoking
the binary with `<description> <server-url> [options]`.

This repo is a Yarn-workspaces + Lerna monorepo with two packages:
`packages/dredd` (the CLI) and `packages/dredd-transactions` (its parser/compiler
library, plain JS — no build step). The CLI binary is
`packages/dredd/bin/dredd`, which requires the TypeScript-compiled
`packages/dredd/build/`.

The agent path is the driver at
[.claude/skills/run-dredd/driver.mjs](.claude/skills/run-dredd/driver.mjs): it
boots the binary, dry-run-compiles all three description formats from bundled
fixtures, and runs a live pass/fail validation against a throwaway Node backend.

**All paths below are relative to the repo root** (the directory containing this
`packages/` folder).

## Prerequisites

- Node.js **>= 20** (`packages/dredd` `engines.node`). Verified on Node 24.
- Yarn 1.x (classic). The repo uses Yarn workspaces; npm will not link the
  workspaces correctly. If `yarn` isn't installed, `corepack yarn ...` works.

## Build

```bash
yarn install
yarn build
```

`yarn build` runs `lerna exec` → `tsc --build` for `packages/dredd`
(dredd-transactions' build is a no-op; it ships as plain JS). Output lands in
`packages/dredd/build/`. The optional `protagonist` native dependency fails to
compile and is **safely ignored** — Dredd deliberately avoids it.

## Run (agent path) — the driver

From the repo root:

```bash
node .claude/skills/run-dredd/driver.mjs          # full smoke, exits non-zero on failure
node .claude/skills/run-dredd/driver.mjs version  # binary boots, prints version
node .claude/skills/run-dredd/driver.mjs formats  # dry-run apib / oas2 / oas3.1 fixtures
node .claude/skills/run-dredd/driver.mjs e2e       # live backend: pass + fail validation
node .claude/skills/run-dredd/driver.mjs run <desc> <server-url> [dredd opts...]  # passthrough
```

Expected full-smoke output (in an environment that permits TCP `listen()`):

```
dredd CLI smoke
--------------
  PASS  cli --version boots and exits 0
  PASS  dry-run compiles API Blueprint
  PASS  dry-run compiles OpenAPI 2
  PASS  dry-run compiles OpenAPI 3.1
  PASS  live validation passes against conforming backend
  PASS  live validation fails against non-conforming backend
--------------
6 passed, 0 failed
```

The `e2e` check **auto-skips** with a clear message if the environment blocks
`listen()` (see Gotchas). `formats` exercises the parser + transaction compiler
end-to-end without any network, so it always runs.

## Run (human path) — the raw CLI

```bash
node packages/dredd/bin/dredd --version
node packages/dredd/bin/dredd --help
# Parse + compile, no HTTP:
node packages/dredd/bin/dredd packages/dredd/test/fixtures/single-get-path.apib http://127.0.0.1:3000 --dry-run
# Real validation against a running backend:
node packages/dredd/bin/dredd ./api-description.apib http://127.0.0.1:3000
```

Exit code is `0` when all transactions pass (or all are skipped in `--dry-run`),
`1` on any failure, error, missing description file, or connection refused.

## Test

```bash
cd packages/dredd
node_modules/.bin/mocha "test/unit/**/*-test.js"   # unit suite
```

707 unit tests pass. The 19 failures in a restricted sandbox are all the
hooks-worker tests, which spawn a hooks handler over a local socket (blocked
when `listen()` is denied — see Gotchas). `yarn test` (mocha) and `yarn e2e`
(cucumber) at the package level also exercise integration tests that bind
servers and need an unrestricted environment.

## Gotchas

- **TCP `listen()` may be blocked.** In a sandboxed shell, binding any server
  socket fails with `EPERM` (`listen EPERM 127.0.0.1:...`). This blocks the
  live `e2e` driver check, the 19 hooks-worker unit tests, and all
  package-level integration/e2e tests — none of which is a code defect. The
  driver's `formats`/`version`/`dry-run` paths need no listener and always run.
- **`protagonist` build failure is expected.** The C++ API Blueprint binding
  fails `node-gyp` and is an *optional* dependency. Dredd uses a pure-JS parser;
  the smoke test even asserts `protagonist` is absent.
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
