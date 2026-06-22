#!/bin/bash
# Performs a smoke test verifying the package produced by the build
# is installable and that Dredd's core life functions are okay

# Aborts as soon as anything returns non-zero exit status
set -e

TMPDIR="$(mktemp -d)"
PROJECT_DIR="$(pwd)/../.."

# install monorepo package into $TMPDIR
install() {
  PACKAGE="$1"

  cd "$PROJECT_DIR/packages/$PACKAGE"
  TARBALL="$(npm pack | tail -n1)"
  mv "$PROJECT_DIR/packages/$PACKAGE/$TARBALL" "$TMPDIR"

  cd "$TMPDIR" && npm install --no-save "$TARBALL"
}

# Prepare a throwaway project to install the packed tarballs into
cd "$TMPDIR" && npm init --yes > /dev/null

install dredd-transactions
install dredd

cd "$TMPDIR"

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
