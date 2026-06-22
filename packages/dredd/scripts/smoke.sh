#!/bin/bash
# Performs a smoke test verifying the package produced by the build
# is installable and that Dredd's core life functions are okay

# Aborts as soon as anything returns non-zero exit status
set -e

TMPDIR="$(mktemp -d)"
PROJECT_DIR="$(pwd)/../.."

# Pack a monorepo package into a tarball inside $TMPDIR and echo its filename.
# Note: only packing here, NOT installing. dredd depends on the unpublished
# '@stacklych/dredd-transactions@^0.1.0', so the tarballs must be installed
# together (see below) to avoid npm trying to resolve it from the registry.
pack() {
  PACKAGE="$1"

  cd "$PROJECT_DIR/packages/$PACKAGE"
  TARBALL="$(npm pack | tail -n1)"
  mv "$PROJECT_DIR/packages/$PACKAGE/$TARBALL" "$TMPDIR"

  echo "$TARBALL"
}

# Prepare a throwaway project to install the packed tarballs into
cd "$TMPDIR" && npm init --yes > /dev/null

# Pack both packages first.
DREDD_TRANSACTIONS_TARBALL="$(pack dredd-transactions)"
DREDD_TARBALL="$(pack dredd)"

cd "$TMPDIR"

# Install BOTH tarballs in a single command. Passing the locally-packed
# 'dredd-transactions' (version 0.1.0) tarball alongside the 'dredd' tarball
# lets npm satisfy dredd's '@stacklych/dredd-transactions@^0.1.0' dependency
# from the provided tarball, so it never hits the npm registry for that
# unpublished package (which would 404).
npm install --no-save "$DREDD_TRANSACTIONS_TARBALL" "$DREDD_TARBALL"

# Assert that Protagonist (the C++ dependency) was not installed
if [[ "$(find node_modules -name protagonist)" != "" ]]; then
  echo "ERROR: It looks like Dredd has tried to install the 'protagonist'"\
    "library (a C++ binding for the API Blueprint parser), which is"\
    "an unwanted behavior of the installation process. The lock file"\
    "of the 'dredd-transactions' library together with its"\
    "'scripts/postshrinkwrap.js' script should have prevented this."
  exit 1
fi

# Test the command-line interface is installed and runs
"$TMPDIR/node_modules/.bin/dredd" --version

# Test the JavaScript API
node -e 'process.exitCode = (new (require("@stacklych/dredd"))({})).run ? 0 : 1;'

rm -fr "$TMPDIR"
