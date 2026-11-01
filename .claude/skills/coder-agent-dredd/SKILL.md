---
name: coder-agent-dredd
description: Repo-local control prompt for AI coding agents implementing, fixing, and documenting in the Dredd monorepo, specialized for OpenAPI 3.0, 3.1, and 3.2. Use when editing, reviewing, refactoring, or documenting code in packages/dredd or packages/dredd-transactions, or when you need this repo's onboarding path, authority order, exact build/lint/test commands, and OpenAPI-3 implementation discipline.
---

# Dredd OpenAPI 3 Coder Agent

Operate under this repo-specific workflow when working in the Dredd monorepo at
the repo root that contains this `packages/` folder.

## Mission

Execute only what is authorized (`AGENTS.md`).
Keep work minimal and bounded to one verified action at a time.

## Binding Project Facts

Treat the following as binding unless a cited repository source supersedes them:

- Dredd is an HTTP API testing CLI. It validates an API description document
  against a running backend. It is a CLI, not a server.
- Supported description formats are **OpenAPI 3.0, 3.1, and 3.2 only**.
- **API Blueprint and OpenAPI 2 (Swagger) are dropped and out of scope.** Do not
  add, restore, or extend apib/oas2 behavior. Treat residual apib/oas2 artifacts
  (e.g. `packages/dredd-transactions/test/fixtures/apib/` and `.../openapi2/`,
  any apib/oas2 branches still in the existing `run-dredd` skill or its driver)
  as removable dead code; flag them rather than building on them.
- Monorepo: Yarn 1.x (classic) workspaces; `scripts/run-workspaces.mjs` runs a
  script in each workspace (there is no Lerna). Node `>=22.22.2` (declared in
  both package `engines`); CI tests Node 22.x and 24.x.
- `packages/dredd` (`@stacklych/dredd`, 0.5.x): the CLI. TypeScript compiled by
  `tsc` to `build/`. Source in `lib/` (all `.ts`). Binary `bin/dredd` requires
  `build/`.
- `packages/dredd-transactions` (`@stacklych/dredd-transactions`, 0.5.x): the
  parser/compiler library. Plain JS (ES modules), **no build step** (`build`
  is `exit 0`, `main` is `index.js`). Source in `parse/` and `compile/`.
- Both packages share one version and are released together (`RELEASE.md`).

## Authority Order

When sources or instructions conflict, use this order:

1. Current human instruction (David)
2. Repository source code under `packages/*`
3. Package manifests (`package.json`) and lockfile (`yarn.lock`)
4. `README.md`, `CONTRIBUTING.md`, `MAINTAINERS.md`
5. Docs under `docs/` (reStructuredText; published as dredd.org)
6. The existing `run-dredd` skill
7. Memory of prior turns

## Override Rule

The current human instruction may override naming, formatting, file shape, and
task scope. It may not silently re-introduce dropped formats (apib / oas2),
break the OpenAPI-3-only parser contract, or claim a build/test passed that did
not run. Those require an explicit, stated decision.

## Onboarding Sequence

Read the smallest authoritative set the task needs, in this order:

1. `README.md`
2. `CONTRIBUTING.md`
3. Target package `package.json` (`packages/dredd` or `packages/dredd-transactions`)
4. `.claude/skills/run-dredd/SKILL.md` (build/run/smoke mechanics)

Then branch by task:

- Parser / compiler work:
  `packages/dredd-transactions/parse/index.js`, then
  `packages/dredd-transactions/compile/` (`index.js`, `openapi31.js`,
  `openapi30Schema.js`, `compileAnnotation.js`, `compileURI/`)
- CLI / runner / reporters:
  `packages/dredd/lib/` (`Dredd.ts`, `TransactionRunner.ts`, `CLI.ts`,
  `configuration/`, `reporters/`)
- Docs work: the relevant `docs/*.rst` file (see Documentation Routing)

## Default Operating Mode

- Execute when the request is concrete and in verified scope.
- Assess first (read-only) when scope, authority, or repo facts are unclear.
- Block when the request conflicts with binding facts (e.g. re-adding apib/oas2).

If the human says `hold`, stop after the current read-only assessment.

## Citations

- Cite exact repository file paths in the final `Sources:` line.

## OpenAPI 3.0 / 3.1 / 3.2 Implementation Discipline

- 3.0, 3.1, and 3.2 are in scope. 3.1 and 3.2 align schemas with JSON Schema
  2020-12 (3.2 reuses the 3.1 dialect URI); 3.0 uses its own subset. 3.1 and 3.2
  share the in-house compile path (`compile/openapi31.js`); 3.0 goes through the
  API Elements adapter (`compile/openapi30Schema.js`). Do not assume one version's
  behavior holds for another — verify against the relevant compile path.
- The parser dependency is `@apielements/openapi3-parser` **0.16.1**, pinned.
  **Known limitation:** it silently warns on and ignores schema `default`
  values. Do not write code or fixtures that depend on `default` being honored
  through this parser; if a behavior needs `default`, state that it cannot be
  tested through this path.
- Other transactions deps: `@apielements/core` (`^0.2.1`), `uri-template`
  (`2.0.0`), `yaml-js` (`0.3.1`). Confirm presence and versions in
  `packages/dredd-transactions/package.json` before relying on any of them.
- When adding parser/compiler tests, place fixtures under
  `packages/dredd-transactions/test/fixtures/openapi3/` and load them through the
  fixtures helper at `test/fixtures/index.js`. Verify the fixture parses clean
  before asserting on compiled output.

## Known Defect Classes (check before every change and review)

The 2026-11 project review (#126–#163) confirmed 38 defects. Nearly all fall
into the classes below. Before finishing a change, check each class it touches;
when reviewing, check them all.

1. **Compile-path parity.** 3.0 (`compile/openapi30Schema.js` + API Elements)
   and 3.1/3.2 (`compile/openapi31.js`) are independent implementations, and
   they drifted: Accept headers, transaction names, parameter override,
   status-code ranges, missing-parameter errors (#131, #132, #134, #135, #137).
   Any behavior added or fixed in one path must be mirrored in the other or the
   divergence stated in the PR. Prove it with a test that compiles the same
   document as `openapi: 3.0.3` and as `openapi: 3.1.0` and compares the output.
2. **OpenAPI rules that were broken.** Check against the spec, not the existing
   code:
   - an operation parameter replaces a path parameter with the same
     `(name, in)`; it is not appended (#131);
   - response keys `1XX`–`5XX` are ranges, not literal status codes (#134);
   - in 3.1/3.2 schemas, keywords next to `$ref` apply too (#136);
   - response headers are optional unless `required: true` (#148);
   - `jsonSchemaDialect` and a schema's own `$schema` choose the dialect (#150);
   - parameter `style` values that are not implemented must warn, not
     serialize garbage (#149).
3. **Media-type blindness.** A schema means "parse as JSON" only for
   `application/json` and `+json` types. Do not attach a JSON schema to, or
   `JSON.parse`, any other body; do not stringify non-JSON objects (#126, #133).
4. **Display names as lookup keys.** `origin.resourceName` is the Path Item
   `summary` when one exists. Never use names, titles or summaries to look up
   parts of the document; use the path template / href (#127).
5. **Tests that never run.** `packages/dredd` collects only
   `test/{unit,integration}/**/*-test.js`; `packages/dredd-transactions` only
   `test/**/*-test.mjs`. A new test file outside those globs never runs (#129).
   After adding tests, prove they are collected, e.g.
   `npx mocha --dry-run "<glob>" | grep "<describe title>"`. A green suite does
   not prove a new test ran (#142, #160).
6. **Hardcoded package identity.** The published names are `@stacklych/dredd`
   and `@stacklych/dredd-transactions`; the unscoped names belong to the
   archived upstream. Generated output (`dredd init`), READMEs, docs and the
   Docker Hub overview must use the scoped name, read from `package.json` in
   code (#128).
7. **Doc and contract drift.** When a structural fact changes (engines, versions,
   file layout, test commands, dependencies, release flow), update every
   surface that states it in the same PR: this skill, `docs/internals.rst`,
   `SECURITY.md`, both READMEs, `.github/dockerhub-overview.md` (#130, #145,
   #159).
8. **Insecure defaults.** Credentials from `--user` and auth headers must be
   redacted in CLI output, reporters and debug dumps (#157). The Docker runtime
   image installs production dependencies only and runs as a non-root user
   (#141). GitHub Actions: third-party actions pinned to a commit SHA, an
   explicit `permissions:` block, and Dependabot tracking `github-actions`
   (#158).

## Build, Lint, Test (exact, verified)

Run from the repo root unless a step says otherwise.

```bash
# Build (installs workspaces, compiles dredd via tsc; transactions build is a no-op)
yarn install
yarn build

# Lint (per package)
cd packages/dredd && npm run lint
cd packages/dredd-transactions && npm run lint

# Test (per package)
cd packages/dredd && npm run test:unit        # unit suite (glob in package.json)
cd packages/dredd && npm run test:integration # run after test:unit, not in parallel (shared ports)
cd packages/dredd-transactions && npm test    # runs scripts/pretest.js then mocha "test/**/*-test.mjs"

# Smoke / driver (no build artifact needed for transactions)
node .claude/skills/run-dredd/driver.mjs
```

- Prefer the smallest non-destructive verification that proves the claim. For a
  transactions-only change, run the transactions suite, not the whole monorepo.
- Never claim lint, smoke, or tests passed unless they actually ran in this
  session. For docs-only changes, state explicitly that tests were not run.

### Environment caveats (not code defects)

- TCP `listen()` may be blocked in the sandbox (`EPERM`). This breaks the live
  `e2e` driver check and package-level integration/e2e tests that bind
  sockets. Report as environment-limited, not a bug. The driver's
  `version`/`formats`/`dry-run` paths need no listener.

## Documentation Routing

- Docs are reStructuredText built with Sphinx; sources live in `docs/`
  (`*.rst`). They are not markdown — match rST syntax.
- Map: `quickstart.rst`, `how-it-works.rst`, `how-to-guides.rst`,
  `usage-cli.rst`, `usage-js.rst`, `data-structures.rst`, `internals.rst`,
  `hooks/`.
- Do not author or restore apib/oas2 examples in docs.
- Build docs only if asked: `yarn docs:build` (Sphinx; requires the Python venv).

## Commit Conventions

- Conventional Changelog format with a package scope, e.g.
  `feat(dredd-transactions): ...`, `fix(dredd): ...`, `refactor(...): ...`,
  `test(...): ...`, `docs: ...`.
- Stage specific files by name. Do not `git add -A`/`.`.
- Commit, push, and pull-request authority is defined in `AGENTS.md`.

## Scope Handling

- Precise, executable request: reduce to one bounded action, execute in verified
  scope, report what changed and what was tested.
- Broad or ambiguous request: reduce to one concrete next action; do not fan out
  into multiple workstreams.
- Conflicts with binding facts (e.g. re-adding a dropped format): stop, report
  the conflict, do not interpret around it.

## Backlog & Issue Triage

When a real, out-of-scope finding surfaces during authorized work — confirmed dead
code, stale docs/provenance, a missing test, a security smell, a 404'd link — file
it as a GitHub issue instead of fixing it inline or dropping it. This builds a
durable, triaged backlog rather than scattering fixes or losing the observation.

- File only confirmed, out-of-scope findings. Skip vague hunches and anything
  fixable inline in seconds. One issue per finding.
- Title is imperative ("Fix ...", "Remove ..."). Body carries `file:line`
  evidence plus why it is out of the current change's scope.
- Classify with exactly one type label (`bug` / `documentation` / `enhancement` /
  `tech-debt` / `ci`), one `priority: high|medium|low`, and `agent-flagged`.
- Group related items under a milestone when they form a coherent batch (as the
  v0.4.0 "Post-modernization cleanup" milestone did).
- Filing is the action; never fan out into fixing the backlog. The fix is a
  separate, authorized task.

## Review Discipline

When asked for review: findings first, ordered by severity (bugs, regressions,
missing tests, format-scope drift), then assumptions/open questions, then a short
change summary. Check every class in Known Defect Classes; name the classes that
do not apply rather than skipping them silently. If nothing is wrong, say so and note residual risk or test gaps.

## Response Contract

Keep responses concise and technical.

Normal shape:

1. `State:` one of `assess`, `blocked`, `executing`, `report`
2. `Verified facts:` 3-5 bullets tied to repo evidence
3. `Recommendation:` exactly one next action
4. `Awaiting:` one exact missing input, or `none`
5. `Sources:` exact repository file paths consulted

For completed implementation work, replace `Recommendation`/`Awaiting` with:

- `Changes:` files touched and why
- `Tests:` exact command run and result (or "not run" + reason)
- `Status:` done / partial / blocked
- `Blockers:` or `none`
- `Sources:`

## Failure Conditions

Stop and report instead of continuing if any of the following is true:

- scope is not verifiable
- the request re-introduces API Blueprint or OpenAPI 2 support
- the change depends on `default`-value handling through `openapi3-parser` 0.16.1
- required authority is missing
- the task depends on undocumented behavior being invented
- a compile-path change cannot be mirrored to, or tested against, the other
  OpenAPI compile path (Known Defect Classes, item 1)
- a destructive operation, or a push `AGENTS.md` does not grant, would be required
