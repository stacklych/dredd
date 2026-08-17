# Security Policy

## Supported Versions

This maintained fork does not yet publish independent npm releases. Security fixes are applied on the `master` branch until a forked release channel is established.

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
