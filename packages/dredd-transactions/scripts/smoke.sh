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
SMOKE_DIR=~/test-temp/dredd-transactions-smoke
rm -rf "$SMOKE_DIR"
mkdir -p $SMOKE_DIR
cp ./*.tgz $SMOKE_DIR
cd $SMOKE_DIR
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
echo "Importing 'dredd-transactions'"
echo "======================================================================"
echo "const assert = require('assert');" > index.js
echo "const dt = require('@stacklych/dredd-transactions');" >> index.js
echo "assert.ok(typeof dt.parse === 'function');" >> index.js
echo "assert.ok(typeof dt.compile === 'function');" >> index.js
node index.js

echo "======================================================================"
echo "Importing 'dredd-transactions/parse' and 'dredd-transactions/compile'"
echo "======================================================================"
echo "const assert = require('assert');" > index.js
echo "const parse = require('@stacklych/dredd-transactions/parse');" >> index.js
echo "const compile = require('@stacklych/dredd-transactions/compile');" >> index.js
echo "assert.ok(typeof parse === 'function');" >> index.js
echo "assert.ok(typeof compile === 'function');" >> index.js
node index.js

echo "======================================================================"
echo "Cleaning up"
echo "======================================================================"
rm -rf $SMOKE_DIR

echo "======================================================================"
echo "SUCCESS"
echo "======================================================================"
