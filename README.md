# Dredd — HTTP API Testing Framework

![Dredd - HTTP API Testing Framework](docs/_static/images/dredd.png?raw=true)

> **Dredd is a language-agnostic command-line tool for validating
> API description document against backend implementation of the API.**

- [Documentation][]
- [Changelog][]
- [Contributor's Guidelines][]

## Maintained Fork

This repository is owned and maintained by **Stackly**. It is a maintained fork of [Apiary Dredd](https://github.com/apiaryio/dredd), which was archived upstream on November 8, 2024. The original project remains licensed under MIT; this fork keeps the original license notice and continues development independently at [dalberola/dredd](https://github.com/dalberola/dredd).

The npm package names are currently kept as `dredd` and `dredd-transactions` in source metadata for compatibility with the existing workspace and import paths. New npm publishing should use a distinct scoped package plan before release.

Dredd reads your API description and step by step validates whether your API
implementation replies with responses as they are described in the
documentation.

### Supported API Description Formats

Dredd supports **OpenAPI 3.0 and OpenAPI 3.1 only**. API Blueprint and OpenAPI 2
(Swagger) are no longer supported — convert older descriptions to OpenAPI 3
before using Dredd.

- [OpenAPI 3][] (3.0)
- [OpenAPI 3.1][]

Both versions validate response status, structure, and **data types** against
the described schemas (including `$ref`, `allOf`, arrays, `nullable`, and string
formats).

### Supported Hooks Languages

Dredd supports writing [hooks](https://dredd.org/en/latest/hooks/)
— a glue code for each test setup and teardown. Following languages are supported:

- [Go](https://dredd.org/en/latest/hooks-go/)
- [Node.js (JavaScript)](https://dredd.org/en/latest/hooks-nodejs/)
- [Perl](https://dredd.org/en/latest/hooks-perl/)
- [PHP](https://dredd.org/en/latest/hooks-php/)
- [Python](https://dredd.org/en/latest/hooks-python/)
- [Ruby](https://dredd.org/en/latest/hooks-ruby/)
- [Rust](https://dredd.org/en/latest/hooks-rust/)
- Didn't find your favorite language? _[Add a new one!](https://dredd.org/en/latest/hooks-new-language/)_

### Supported Systems

- Linux, macOS, Windows
- Runs in any CI environment (GitHub Actions, CircleCI, AppVeyor, etc.)

## Installation

```
$ npm install -g dredd
```

## Quick Start

1.  Create an [OpenAPI 3][] description file called `api-description.yaml`.
2.  Run interactive configuration:

    ```shell
    $ dredd init
    ```

3.  Run Dredd:

    ```shell
    $ dredd
    ```

4.  To see how to use all Dredd's features, browse the
    [full documentation][documentation].

[openapi 3]: https://spec.openapis.org/oas/v3.0.4.html
[openapi 3.1]: https://spec.openapis.org/oas/v3.1.2.html
[documentation]: https://github.com/dalberola/dredd/tree/master/docs
[changelog]: https://github.com/dalberola/dredd/releases
[contributor's guidelines]: https://github.com/dalberola/dredd/blob/master/MAINTAINERS.md
