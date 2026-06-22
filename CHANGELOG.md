# Changelog

All notable changes in this maintained fork are documented here.

This fork follows Semantic Versioning. The original upstream changelog remains available in the archived Apiary Dredd GitHub releases.

## Unreleased

_This section will be published as the **0.1.0** baseline of the maintained fork. The version line was reset from the inherited upstream numbers (`dredd` 14.x, `dredd-transactions` 10.x) to start the fork's own Semantic Versioning history at 0.1.0._

### Added

- OpenAPI 3.1 response-testing compiler path — a custom in-repo compiler for `openapi: 3.1.x` documents.
- Response validation against the OpenAPI 3.1 Schema Object dialect and JSON Schema 2020-12, including Ajv string and numeric formats such as `uri` and `uuid`.
- OpenAPI 3.1 parameter handling across all four locations (path, query, header, cookie): `simple`/`form` serialization of arrays and objects with `explode`, and schema `default` values.
- OpenAPI 3.1 response-header derivation, one transaction per request and response content type, `allOf` request/response body composition, and termination on self-referential schemas.
- Error annotations for unresolvable internal `$ref`s — direct and transitive — in OpenAPI 3.1 documents.
- Maintained-fork metadata and documentation.

### Changed

- `dredd-transactions` test suite migrated to `chai` 6 (ESM); `dredd` retains `chai` 4 so CommonJS hookfiles keep working.
- Node.js engine floor raised to 22; CI runs the test matrix on Node.js 22 and 24.
- Refreshed the dependency tree to maintained releases while preserving the CommonJS package surface.
- Removed `lerna` from the monorepo tooling.
- Response validation (status code, headers, and structural/text body checks) is now performed by a built-in TypeScript validator (`lib/validation`) instead of the vendored Gavel.js bundle. Behaviour — verdicts and error messages — is preserved.

### Removed

- API Blueprint and OpenAPI 2 (Swagger) support, together with their parser and runtime dependencies. Dredd now targets OpenAPI 3.0 and OpenAPI 3.1 only; convert older descriptions to OpenAPI 3 before use.
- Vendored Gavel.js validator bundle (`lib/vendor/gavel.js`, ~10k lines) and the dependency on the unmaintained upstream `gavel` package.

### Notes

- Source package names remain `dredd` and `dredd-transactions`. A scoped package name is planned before any public npm publish.
- Older upstream history remains available in the archived Apiary Dredd GitHub releases.
