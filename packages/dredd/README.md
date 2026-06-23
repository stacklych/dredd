# @stacklych/dredd — HTTP API Testing Tool

> **Dredd is a language-agnostic command-line tool for validating an API
> description document against the backend implementation of the API.**

Dredd reads your API description and, step by step, validates whether your API
implementation replies with the responses described in the documentation —
checking response status, structure, and data types against the described
schemas (including `$ref`, `allOf`, arrays, `nullable`, and string formats).

- [Documentation](https://stacklych.github.io/dredd/)
- [Source & issues](https://github.com/stacklych/dredd)
- [`@stacklych/dredd-transactions`](https://www.npmjs.com/package/@stacklych/dredd-transactions) — the parser/compiler library behind this CLI

## Maintained fork

This package is owned and maintained by **Stackly**. It is a maintained fork of
[Apiary Dredd](https://github.com/apiaryio/dredd), archived upstream on
November 8, 2024. The original MIT license notice is preserved; development
continues independently at [stacklych/dredd](https://github.com/stacklych/dredd).

## Supported API description formats

Dredd supports **OpenAPI 3.0, 3.1, and 3.2 only**. API Blueprint and OpenAPI 2
(Swagger) are not supported — convert older descriptions to OpenAPI 3 first.

## Requirements

- Node.js **>= 20**

## Installation

```shell
$ npm install -g @stacklych/dredd
```

## Quick start

1. Create an OpenAPI 3 description file called `api-description.yaml`.
2. Run the interactive configuration:

   ```shell
   $ dredd init
   ```

3. Run Dredd against your backend:

   ```shell
   $ dredd ./api-description.yaml http://127.0.0.1:3000
   ```

Compile and inspect the transactions without sending any requests with
`--dry-run`:

```shell
$ dredd ./api-description.yaml http://127.0.0.1:3000 --dry-run
```

See the [full documentation](https://stacklych.github.io/dredd/) for hooks,
reporters, configuration, and CI usage.

## Hooks

Dredd supports [hooks](https://stacklych.github.io/dredd/) — glue code for test
setup and teardown — written in JavaScript, available out of the box.

## ESM only

As of **v0.2.0**, this package is published as an **ES module**. The `dredd` CLI
is unaffected, but the programmatic API must be imported as an ES module:

```js
import Dredd from '@stacklych/dredd';

const dredd = new Dredd({ endpoint: 'http://127.0.0.1:3000', path: ['./api-description.yaml'] });
dredd.run((err, stats) => {
  if (err) throw err;
});
```

CommonJS `require('@stacklych/dredd')` is no longer supported.

## License

MIT
