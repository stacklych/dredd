# Maintainers

This repository is the Stackly-maintained fork of Dredd at `stacklych/dredd`. The project is owned and maintained by **Stackly**.

The original upstream repository, `apiaryio/dredd`, was archived on November 8, 2024 and is read-only. Keep the MIT license notice intact and avoid implying that Apiary or Oracle maintains this fork.

## Current Maintainer

- **Stackly** - project ownership and direction
- `@stacklych` - fork maintenance, issue triage, release decisions

## Maintenance Rules

- Keep changes small, tested, and documented.
- Preserve backward compatibility for the existing `dredd` CLI unless a release is explicitly marked breaking.
- Publish forked npm packages only under the `@stacklych` scope. The unscoped `dredd` and `dredd-transactions` names on npm belong to the original maintainers and must not be used unless ownership is explicitly transferred.
- Keep dependency upgrades separate from feature work unless the upgrade is required for the feature.
- Run lint, targeted tests, and documentation builds before release.

## Release Checklist

1. Confirm the working tree is clean.
2. Run `yarn install --frozen-lockfile`.
3. Run `yarn build`.
4. Run `yarn lint`.
5. Run `yarn test`.
6. Run `PATH="$PWD/.venv-docs/bin:$PATH" yarn docs:build`.
7. Run `yarn test:smoke`, which packs both packages, installs the tarballs into a throwaway project, and checks the `dredd` CLI and the ESM entry point. OpenAPI 3.0, 3.1, and 3.2 coverage comes from the test suites in step 5, not from this step.
8. Draft the release notes, published as a GitHub Release after tagging.
9. Tag the release. Pushing the `v<version>` tag publishes both npm packages and the Docker image.

`RELEASE.md` is the authoritative runbook — versioning policy, the pre-tag
documentation check, what each publish workflow produces, and how to verify a
release landed. Follow it rather than this summary when cutting a release.

## Package Publishing Note

The unscoped `dredd` and `dredd-transactions` names on npm belong to the original maintainers. This fork publishes as `@stacklych/dredd` and `@stacklych/dredd-transactions`, and must keep doing so unless that ownership is explicitly transferred.
