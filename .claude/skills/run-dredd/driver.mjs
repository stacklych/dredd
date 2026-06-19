#!/usr/bin/env node
// Driver for the Dredd CLI (packages/dredd). Smoke-tests the built binary:
// boots it, compiles transactions from the supported OpenAPI 3.0 and 3.1
// description formats via --dry-run, and runs a real end-to-end HTTP validation
// Node backend (pass + fail cases). Pure Node, no extra deps.
//
//   node .claude/skills/run-dredd/driver.mjs            # full smoke (default)
//   node .claude/skills/run-dredd/driver.mjs version
//   node .claude/skills/run-dredd/driver.mjs formats    # dry-run oas3.0/oas3.1
//   node .claude/skills/run-dredd/driver.mjs e2e        # live backend pass+fail
//   node .claude/skills/run-dredd/driver.mjs run <desc> <server> [dredd opts...]
//
// Run from the repo root after `yarn install && yarn build`.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..'); // <root>/.claude/skills/run-dredd -> <root>
const BIN = resolve(ROOT, 'packages/dredd/bin/dredd');
const FIX = resolve(ROOT, 'packages/dredd/test/fixtures');

if (!existsSync(resolve(ROOT, 'packages/dredd/build/CLI.js'))) {
  console.error('FAIL: packages/dredd/build/CLI.js missing — run `yarn build` first.');
  process.exit(2);
}

const QUIET = /proxy specified by environment|padLevels|trace-warnings|util\._extend|DeprecationWarning|circular dependency/;
function clean(s) {
  return s.split('\n').filter((l) => l && !QUIET.test(l)).join('\n');
}
// Run the CLI synchronously, return { code, out }.
function dredd(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    ...opts,
  });
  return { code: r.status, out: clean((r.stdout || '') + (r.stderr || '')) };
}
// Run the CLI asynchronously (needed when an HTTP server runs in the same process).
function dreddAsync(args, opts = {}) {
  return new Promise((resolve) => {
    const chunks = [];
    const proc = spawn(process.execPath, [BIN, ...args], {
      cwd: ROOT,
      timeout: 60000,
      ...opts,
    });
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => chunks.push(d));
    proc.on('close', (code) => resolve({ code, out: clean(Buffer.concat(chunks).toString()) }));
  });
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function cmdVersion() {
  const { code, out } = dredd(['--version']);
  check('cli --version boots and exits 0', code === 0 && /dredd v\d+\.\d+/.test(out), out.split('\n')[0]);
}

// Dry-run each supported format: parse + compile transactions, no HTTP. Exit
// code 0, and at least one transaction skipped (dry run skips, not requests).
function cmdFormats() {
  const cases = [
    ['OpenAPI 3.0', 'openapi30-json-schema.yml'],
    ['OpenAPI 3.1', 'openapi31-json-schema.yml'],
  ];
  for (const [label, file] of cases) {
    const { code, out } = dredd([resolve(FIX, file), 'http://127.0.0.1:3000', '--dry-run']);
    check(`dry-run compiles ${label}`, code === 0 && /\d+ skipped/.test(out), `exit=${code}`);
  }
}

// Try to bind a throwaway backend; resolves null if the sandbox blocks listen().
function startBackend(bad) {
  return new Promise((res) => {
    const srv = createServer((req, reply) => {
      reply.setHeader('Content-Type', 'application/json');
      if (req.url === '/message') {
        reply.statusCode = 200;
        reply.end(JSON.stringify(bad ? { msg: 'wrong' } : { text: 'Hello World!' }));
      } else {
        reply.statusCode = 404;
        reply.end('{}');
      }
    });
    srv.once('error', (e) => res({ err: e.code }));
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

const OAS3 = `openapi: 3.1.0
info:
  title: Smoke API
  version: 1.0.0
paths:
  /message:
    get:
      responses:
        '200':
          description: A message
          content:
            application/json:
              schema:
                type: object
                required: [text]
                properties:
                  text:
                    type: string
              example:
                text: Hello World!
`;

async function cmdE2e() {
  const probe = await startBackend(false);
  if (probe.err) {
    console.log(`  SKIP  live e2e — this environment blocks TCP listen() (${probe.err}). `
      + 'Run on a host without that restriction.');
    return;
  }
  // probe bound fine; reuse it as the "good" backend.
  const fs = await import('node:fs');
  const os = await import('node:os');
  const oasPath = resolve(os.tmpdir(), `dredd-smoke-${probe.port}.yaml`);
  fs.writeFileSync(oasPath, OAS3);

  // PASS case: backend matches the description -> dredd exits 0.
  // dreddAsync is required here: spawnSync blocks the event loop and prevents
  // the in-process HTTP server from responding, causing dredd to time out.
  const good = await dreddAsync([oasPath, `http://127.0.0.1:${probe.port}`]);
  check('live validation passes against conforming backend', good.code === 0 && /1 passing/.test(good.out), `exit=${good.code}`);
  probe.srv.close();

  // FAIL case: backend returns the wrong body shape -> dredd exits 1.
  const badB = await startBackend(true);
  const bad = await dreddAsync([oasPath, `http://127.0.0.1:${badB.port}`]);
  check('live validation fails against non-conforming backend', bad.code === 1 && /1 failing/.test(bad.out), `exit=${bad.code}`);
  badB.srv.close();
  fs.unlinkSync(oasPath);
}

function cmdRun(args) {
  const { code, out } = dredd(args, { stdio: 'inherit' });
  process.exit(code ?? 1);
}

const [, , sub, ...rest] = process.argv;

(async () => {
  if (sub === 'run') return cmdRun(rest);
  if (sub === 'version') return cmdVersion();
  if (sub === 'formats') return cmdFormats();
  if (sub === 'e2e') return cmdE2e();
  // default: full smoke
  console.log('dredd CLI smoke\n--------------');
  cmdVersion();
  cmdFormats();
  await cmdE2e();
  console.log('--------------');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
