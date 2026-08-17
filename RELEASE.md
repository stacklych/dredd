# Release process

This is a Yarn-workspaces monorepo publishing two packages to npm:

- [`@stacklych/dredd`](https://www.npmjs.com/package/@stacklych/dredd)
- [`@stacklych/dredd-transactions`](https://www.npmjs.com/package/@stacklych/dredd-transactions)

The fork's version line starts at the **0.1.0** baseline, reset from the
inherited upstream numbers.

## Versioning policy

- The two packages are versioned **in lockstep**: both carry the same version
  and are released together. This is not a style preference — `publish-npm.yml`
  publishes both packages on every `v*` tag, so releasing one alone would
  attempt to republish the other at an unchanged version and fail the workflow.
- When the versions move, bump the internal `@stacklych/dredd-transactions`
  range in `packages/dredd/package.json` to match.
- Semantic Versioning, with the usual 0.x reading: while the major is `0`, a
  **breaking change takes a minor bump**. Narrowing `engines.node` counts as
  breaking (see v0.5.0); so does removing a feature (v0.4.0) or changing the
  module system (v0.2.0).
- Tags are `v<version>` (for example `v0.5.0`) — a single tag for the release,
  not one per package. The publish workflows trigger on `v*`, so any other tag
  name silently publishes nothing.

## Before cutting a release

Check the documentation that ships inside the packages. `README.md` is listed
in each package's `files`, so it renders on the npm page and is effectively
part of the release. It has drifted before — v0.4.0 shipped a README claiming
`Node.js >= 20` against a real floor of `>=22`, and both READMEs pointed at the
abandoned unscoped upstream packages.

Verify against the code, not from memory:

- the Node requirement in `packages/dredd/README.md` matches `engines.node`
- install commands use the `@stacklych/` scoped names
- the supported OpenAPI versions match what the compiler actually accepts, in
  both READMEs and `docs/usage-cli.rst`

## Cutting a release

1. Branch from an up-to-date `main`.
2. Set `version` in **both** `packages/*/package.json`, and update the
   `@stacklych/dredd-transactions` range in `packages/dredd/package.json`.
3. Run `yarn install` so `yarn.lock` reflects the new versions.
4. Verify locally: `yarn build`, `yarn lint`, `yarn prettify:check`,
   `yarn test`, `yarn test:smoke`, `yarn test:coverage`. The smoke driver packs
   both packages and installs the tarballs together, so the not-yet-published
   internal range resolves locally instead of 404ing against the registry.
5. Open a pull request and let CI go green before merging. Squash-merge with a
   lowercase subject — commitlint re-lints the squash subject on the push to
   `main`, and a capitalised one fails there after the merge has landed.
6. Confirm `main` is green after the merge, before tagging.

The release commit itself is small: two files, three lines.

## Tagging and publishing

```bash
git checkout main
git pull
git tag -a v<version> -m 'v<version>'
git push origin v<version>
```

Pushing the tag is the publish. It triggers:

- **`publish-npm`** — a `verify` job (`install`, `build`, `lint`, `test` on
  Node 22.x) gates the `publish` job, which publishes `dredd-transactions`
  then `dredd`. Both are published public via `publishConfig.access`.
  Note there is currently **no npm provenance attestation**: that would need
  `id-token: write` permission and `npm publish --provenance`, neither of which
  the workflow sets. Published packages carry only the standard npm registry
  signature.
- **`publish-docker`** — builds `linux/amd64` and `linux/arm64` on native
  runners, smoke-tests each architecture, pushes by digest, then assembles a
  multi-arch manifest tagged `<version>`, `<major>.<minor>`, and `latest`.

Publishing is effectively irreversible: npm's unpublish window is 72 hours, and
a version number can never be reused.

## After publishing

1. Create the GitHub Release against the tag (`gh release create v<version>
   --verify-tag`). **GitHub Releases are the release notes of record** — there
   is no changelog file, so this is the only place a release is described.
2. Verify, rather than assuming the workflows did what they claim:
   - `npm view @stacklych/dredd version` and the same for
     `@stacklych/dredd-transactions`
   - the published README carries the current content
     (`npm view @stacklych/dredd@<version> readme`)
   - Docker Hub shows `<version>`, `<major>.<minor>`, and `latest`, each with
     both architectures

## Not covered by the release workflows

- **The Docker Hub repository description.** It is generated from
  `.github/dockerhub-overview.md` and an inline `short-description` in
  `.github/workflows/dockerhub-description.yml`, by a workflow that runs only
  when those two files change. Nothing about tagging or pushing an image
  updates it, and because the workflow overwrites the live page wholesale, a
  stale source silently reverts any manual edit made on Docker Hub. Update
  those files whenever supported formats or the Node base image change.
- **Release notes.** There is no changelog file. `CHANGELOG.md` was removed
  after v0.5.0: it had not been maintained since the 0.1.0 baseline and still
  described that baseline as `Unreleased`, so it misinformed anyone who read
  it. Write the notes in the GitHub Release instead, as step 1 above.
