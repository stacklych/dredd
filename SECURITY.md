# Security Policy

## Supported Versions

This fork publishes:

- [`@stacklych/dredd`](https://www.npmjs.com/package/@stacklych/dredd) and
  [`@stacklych/dredd-transactions`](https://www.npmjs.com/package/@stacklych/dredd-transactions)
  on npm (released together, with the same version), and
- the [`stacklych/dredd`](https://hub.docker.com/r/stacklych/dredd) Docker image.

Security fixes land on the `main` branch and ship in the next release. Only the
latest released minor version (currently 0.5.x) receives security fixes; older
versions are not patched, so upgrade to the latest release. The unscoped
`dredd` and `dredd-transactions` npm packages belong to the archived upstream
project and are not maintained here.

## Reporting a Vulnerability

Report vulnerabilities privately through GitHub Security Advisories for `stacklych/dredd` when available. If private advisories are not enabled, contact the maintainer through a non-public channel before opening a public issue.

Do not include exploit details, credentials, private API descriptions, or live service URLs in a public issue.

## Scope

Security reports should include:

- Dredd CLI behavior
- HTTP request execution
- hook execution boundaries
- parser/compiler behavior for API descriptions
- dependency vulnerabilities that affect runtime or packaging

Out of scope:

- vulnerabilities only present in the archived upstream repository and not reproducible in this fork
- issues requiring malicious local filesystem access beyond the current user's privileges
- reports without a reproducible impact path

## Disclosure

Accepted vulnerabilities should be fixed in a private branch when possible, released, and then documented in the [GitHub Release](https://github.com/stacklych/dredd/releases) notes with a concise impact summary.
