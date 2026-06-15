# Maintainers

This repository is the Stackly-maintained fork of Dredd at `dalberola/dredd`. The project is owned and maintained by **Stackly**.

The original upstream repository, `apiaryio/dredd`, was archived on November 8, 2024 and is read-only. Keep the MIT license notice intact and avoid implying that Apiary or Oracle maintains this fork.

## Current Maintainer

- **Stackly** - project ownership and direction
- `@dalberola` - fork maintenance, issue triage, release decisions

## Maintenance Rules

- Keep changes small, tested, and documented.
- Preserve backward compatibility for the existing `dredd` CLI unless a release is explicitly marked breaking.
- Keep package names unchanged in source until a scoped npm publishing migration is implemented and tested.
- Publish forked npm packages only under a distinct scope, such as `@dalberola`, unless ownership of the original package names is explicitly transferred.
- Keep dependency upgrades separate from feature work unless the upgrade is required for the feature.
- Run lint, targeted tests, and documentation builds before release.

## Release Checklist

1. Confirm the working tree is clean.
2. Run `yarn install --frozen-lockfile`.
3. Run `yarn build`.
4. Run `yarn lint`.
5. Run `yarn test`.
6. Run `PATH="$PWD/.venv-docs/bin:$PATH" yarn docs:build`.
7. Smoke-test the `dredd` CLI against OpenAPI 3.0 and OpenAPI 3.1 fixtures.
8. Update `CHANGELOG.md`.
9. Tag the release.
10. Publish packages only after the fork package naming plan is complete.

## Package Publishing Note

The npm packages `dredd` and `dredd-transactions` are still owned by the original maintainers on npm. This fork should use scoped package names for new publishing unless ownership is transferred.
