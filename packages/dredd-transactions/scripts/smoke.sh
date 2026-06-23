#!/bin/bash
# Packs the package, installs it into a clean project, and verifies the public API imports

# Aborts as soon as anything returns non-zero exit status
set -e
set -o pipefail
shopt -s dotglob

echo "======================================================================"
echo "SMOKE TEST"
echo "======================================================================"

echo "======================================================================"
echo "Packing the 'dredd-transactions' package into a tarball"
echo "======================================================================"
npm pack

echo "======================================================================"
echo "Preparing a temporary test directory"
echo "======================================================================"
SMOKE_DIR="$(mktemp -d)"
trap 'rm -rf "$SMOKE_DIR"' EXIT
cp ./*.tgz "$SMOKE_DIR"
cd "$SMOKE_DIR"
echo "package-lock=true" > .npmrc

# Initialize a test project
npm init -y

echo "======================================================================"
echo "Installing 'dredd-transactions' to the test project using tarball"
echo "======================================================================"
npm install ./*.tgz --save

echo "======================================================================"
echo "Installing the test project from scratch using the lockfile"
echo "======================================================================"
npm ci

echo "======================================================================"
echo "Importing 'dredd-transactions' (the package is ESM)"
echo "======================================================================"
echo "import assert from 'assert';" > index.mjs
echo "import { parse, compile } from '@stacklych/dredd-transactions';" >> index.mjs
echo "assert.ok(typeof parse === 'function');" >> index.mjs
echo "assert.ok(typeof compile === 'function');" >> index.mjs
node index.mjs

echo "======================================================================"
echo "Importing 'dredd-transactions/parse' and 'dredd-transactions/compile'"
echo "======================================================================"
echo "import assert from 'assert';" > index.mjs
echo "import parse from '@stacklych/dredd-transactions/parse';" >> index.mjs
echo "import compile from '@stacklych/dredd-transactions/compile';" >> index.mjs
echo "assert.ok(typeof parse === 'function');" >> index.mjs
echo "assert.ok(typeof compile === 'function');" >> index.mjs
node index.mjs

echo "======================================================================"
echo "Cleaning up"
echo "======================================================================"
# $SMOKE_DIR is removed by the EXIT trap registered above.

echo "======================================================================"
echo "SUCCESS"
echo "======================================================================"
