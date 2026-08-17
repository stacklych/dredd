# Dredd — HTTP API Testing Tool

**Dredd is a language-agnostic command-line tool for validating an API
description document against the backend implementation of the API.**

This image bundles the [`@stacklych/dredd`](https://www.npmjs.com/package/@stacklych/dredd)
CLI on top of `node:22-alpine`, with `dredd` available on the `PATH`.

- **Source & issues:** https://github.com/stacklych/dredd
- **Documentation:** https://stacklych.github.io/dredd/

## Supported API description formats

**OpenAPI 3.0, 3.1, and 3.2 only.** API Blueprint and OpenAPI 2 (Swagger) are
not supported — convert older descriptions to OpenAPI 3 first.

## Tags

- `latest` — the most recent release
- `X.Y.Z` and `X.Y` — specific release versions (e.g. `0.5.0`, `0.5`)

Images are published for `linux/amd64` and `linux/arm64`.

## Usage

Print the version:

```shell
docker run --rm stacklych/dredd dredd --version
```

Validate an API description against a running backend. Mount the directory
containing your description into the container and point Dredd at the backend
URL:

```shell
docker run --rm -v "$PWD:/spec" -w /spec \
  stacklych/dredd dredd ./api-description.yaml http://host.docker.internal:3000
```

> On Docker Desktop, `host.docker.internal` resolves to the host machine. On
> Linux, use the host's address or run with `--network host` and `127.0.0.1`.

Compile and inspect the transactions without sending any requests:

```shell
docker run --rm -v "$PWD:/spec" -w /spec \
  stacklych/dredd dredd ./api-description.yaml http://host.docker.internal:3000 --dry-run
```

See the [full documentation](https://stacklych.github.io/dredd/) for hooks,
reporters, configuration, and CI usage.

## License

MIT — a maintained fork of [Apiary Dredd](https://github.com/apiaryio/dredd).
