# Changelog

All notable changes in this maintained fork are documented here.

This fork follows Semantic Versioning. The original upstream changelog remains available in the archived Apiary Dredd GitHub releases.

## Unreleased

### Added

- OpenAPI 3.1 response-testing compiler path.
- JSON Schema 2020-12 and OpenAPI 3.1 Schema Object dialect response validation.
- OpenAPI 3.1 path `simple` and query `form` parameter serialization for arrays, objects, and `explode`.
- OpenAPI 3.1 validation for Ajv formats such as `uri`, `uuid`, and OpenAPI numeric formats.
- Maintained-fork metadata and documentation.

### Fixed

- OpenAPI 3.1 JSON Schema validation now reports non-JSON response bodies as contract failures instead of Dredd execution errors.
- `dredd-transactions` tarballs now bundle the API Blueprint parser runtime dependencies required by local `.tgz` installs.
- Removed Dredd's direct dependency on the deprecated `request` package by adding an internal Node.js HTTP/HTTPS adapter.
- The internal HTTP/HTTPS adapter retains `http_proxy`/`https_proxy`/`no_proxy` environment variable support (for remote API descriptions and the Apiary reporter) via the maintained `http-proxy-agent` and `https-proxy-agent` packages.
- Regenerated the HTTPS test fixture certificate with a 2048-bit key and SHA-256 signature so the integration suite runs on OpenSSL 3 / Node.js 20+.
- Replaced the deprecated `url.parse()` call in the transaction runner with the WHATWG `URL` API.
- Bumped `chai` to 4.5.0 (resolves the bundled `get-func-name` advisory) and aligned `dredd-transactions` on `js-yaml` 3.14.2.
- Forced a patched transitive `ansi-regex` 5.0.1 via `resolutions`, clearing its high-severity ReDoS advisory without changing any direct dependency. (The `glob` 11 upgrade below supersedes the need to pin `minimatch`/`brace-expansion`, which ship patched within `glob` 11.)
- Bumped `z-schema` to 4.2.4 (within the range required by the bundled OpenAPI 2 / Swagger parsers), pulling in the patched `validator` 13 line and clearing its advisories.
- Replaced the `make-dir` dependency with Node.js's native recursive `fs.mkdir`, removing the package and its vulnerable transitive `semver`.
- Removed Dredd's external `gavel` package dependency by vendoring its built validator bundle.
- `dredd-transactions` now bundles the OpenAPI 2 parser with a fixed JSON Schema example generator dependency.

### Changed

- Refreshed selected direct runtime dependencies to maintained patch/minor releases while preserving the existing CommonJS package surface.
- Updated `inquirer` to the fixed 8.2.7 line and raised the maintained fork's Node.js engine floor to version 20 (Node.js 18 is end-of-life).
- Upgraded `glob` to 11.1.0 (using the modern `globSync`/`hasMagic` API), clearing the glob CLI command-injection advisory; this requires Node.js 20 or newer.
- Updated the GitHub Actions CI matrix to Node.js 20/22 with current `actions/checkout` and `actions/setup-node` versions.
- Replaced the deprecated `optimist` CLI parser dependency with a maintained `minimist`-based parser wrapper.
- Updated Dredd's TypeScript test/build toolchain for compatibility with refreshed dependency declarations.
- Documentation now identifies `dalberola/dredd` as the maintained fork.
- Documentation build dependencies are pinned for reproducible Sphinx 4.3 builds on modern Python.

### Notes

- Source package names remain `dredd` and `dredd-transactions` for compatibility.
- Future npm publishing should use scoped package names unless original package ownership is transferred.
