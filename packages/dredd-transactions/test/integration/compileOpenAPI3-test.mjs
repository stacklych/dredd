import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import createCompileResultSchema from '../schemas/createCompileResultSchema.js';

import { assert, fixtures } from '../support.mjs';
import parse from '../../parse/index.js';
import compile from '../../compile/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function compileOpenAPI31(apiDescription) {
  let compileResult;

  parse(apiDescription, (err, parseResult) => {
    if (err) {
      throw err;
    }
    compileResult = compile(
      parseResult.mediaType,
      parseResult.apiElements,
      'openapi31.yml'
    );
  });

  return compileResult;
}

describe('compile() · OpenAPI 3', () => {
  describe('ordinary, valid API description', () => {
    const { mediaType, apiElements } = fixtures('proof-of-concept').openapi3;
    const compileResult = compile(mediaType, apiElements);

    it('produces some annotation and some transactions', () => {
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: [1],
        transactions: [1],
      }));
    });
  });

  describe('minimal OpenAPI 3.1 API description', () => {
    let compileResult;

    before((done) => {
      const apiDescription = fs.readFileSync(
        path.join(__dirname, '../fixtures/openapi3/openapi31-minimal.yml'),
        'utf8'
      );
      parse(apiDescription, (err, parseResult) => {
        if (err) {
          done(err);
          return;
        }
        compileResult = compile(
          parseResult.mediaType,
          parseResult.apiElements,
          'openapi31-minimal.yml'
        );
        done();
      });
    });

    it('produces one transaction and no annotations', () => {
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: 0,
        transactions: 1,
      }));
    });

    it('expands path and query parameters', () => {
      assert.equal(compileResult.transactions[0].request.uri, '/things/abc?include=details');
    });

    it('compiles request headers and body from examples', () => {
      assert.deepEqual(compileResult.transactions[0].request.headers, [
        { name: 'Content-Type', value: 'application/json' },
      ]);
      assert.equal(compileResult.transactions[0].request.body, '{"name":"created"}');
    });

    it('compiles response headers, body, and OpenAPI 3.1 schema', () => {
      assert.deepEqual(compileResult.transactions[0].response.headers, [
        { name: 'Content-Type', value: 'application/json' },
      ]);
      assert.equal(compileResult.transactions[0].response.body, '{"id":"abc","label":null}');
      assert.deepEqual(JSON.parse(compileResult.transactions[0].response.schema), {
        $schema: 'https://spec.openapis.org/oas/3.1/dialect/base',
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id: { type: 'string' },
          label: { type: ['string', 'null'] },
        },
      });
    });
  });

  describe('OpenAPI 3.1 schema dialects', () => {
    function createAPI(schema, jsonSchemaDialect) {
      return `
openapi: 3.1.0
${jsonSchemaDialect ? `jsonSchemaDialect: ${jsonSchemaDialect}\n` : ''}info:
  title: Dialect API
  version: '1.0'
paths:
  /resource:
    get:
      responses:
        '200':
          description: Representation
          content:
            application/json:
              schema:
${schema.split('\n').map((line) => `                ${line}`).join('\n')}
`;
    }

    it('uses the OAS dialect by default', () => {
      const compileResult = compileOpenAPI31(createAPI('type: object'));
      assert.equal(
        JSON.parse(compileResult.transactions[0].response.schema).$schema,
        'https://spec.openapis.org/oas/3.1/dialect/base'
      );
    });

    it('uses root jsonSchemaDialect when schema has no $schema', () => {
      const compileResult = compileOpenAPI31(createAPI(
        'type: object',
        'https://json-schema.org/draft/2020-12/schema'
      ));
      assert.equal(
        JSON.parse(compileResult.transactions[0].response.schema).$schema,
        'https://json-schema.org/draft/2020-12/schema'
      );
    });

    it('keeps schema-level $schema over root jsonSchemaDialect', () => {
      const compileResult = compileOpenAPI31(createAPI(
        '$schema: https://json-schema.org/draft/2020-12/schema\ntype: object',
        'https://spec.openapis.org/oas/3.1/dialect/base'
      ));
      assert.equal(
        JSON.parse(compileResult.transactions[0].response.schema).$schema,
        'https://json-schema.org/draft/2020-12/schema'
      );
    });
  });

  describe('OpenAPI 3.1 parameter serialization', () => {
    function createAPI(pathTemplate, parameter) {
      return `
openapi: 3.1.0
info:
  title: Parameters API
  version: '1.0'
paths:
  ${pathTemplate}:
    get:
      parameters:
${parameter.split('\n').map((line) => `        ${line}`).join('\n')}
      responses:
        '200':
          description: OK
`;
    }

    [
      {
        name: 'serializes default path simple arrays',
        pathTemplate: '/colors/{color}',
        parameter: `- name: color
  in: path
  required: true
  schema:
    type: array
    items:
      type: string
  example:
    - blue
    - black
    - brown`,
        uri: '/colors/blue,black,brown',
      },
      {
        name: 'serializes path simple objects with explode false',
        pathTemplate: '/colors/{color}',
        parameter: `- name: color
  in: path
  required: true
  style: simple
  explode: false
  schema:
    type: object
  example:
    R: 100
    G: 200
    B: 150`,
        uri: '/colors/R,100,G,200,B,150',
      },
      {
        name: 'serializes path simple objects with explode true',
        pathTemplate: '/colors/{color}',
        parameter: `- name: color
  in: path
  required: true
  style: simple
  explode: true
  schema:
    type: object
  example:
    R: 100
    G: 200
    B: 150`,
        uri: '/colors/R=100,G=200,B=150',
      },
      {
        name: 'serializes default query form arrays with explode true',
        pathTemplate: '/colors',
        parameter: `- name: color
  in: query
  schema:
    type: array
    items:
      type: string
  example:
    - blue
    - black
    - brown`,
        uri: '/colors?color=blue&color=black&color=brown',
      },
      {
        name: 'serializes query form arrays with explode false',
        pathTemplate: '/colors',
        parameter: `- name: color
  in: query
  style: form
  explode: false
  schema:
    type: array
    items:
      type: string
  example:
    - blue
    - black
    - brown`,
        uri: '/colors?color=blue,black,brown',
      },
      {
        name: 'serializes default query form objects with explode true',
        pathTemplate: '/colors',
        parameter: `- name: color
  in: query
  schema:
    type: object
  example:
    R: 100
    G: 200
    B: 150`,
        uri: '/colors?R=100&G=200&B=150',
      },
      {
        name: 'serializes query form objects with explode false',
        pathTemplate: '/colors',
        parameter: `- name: color
  in: query
  style: form
  explode: false
  schema:
    type: object
  example:
    R: 100
    G: 200
    B: 150`,
        uri: '/colors?color=R,100,G,200,B,150',
      },
      {
        name: 'uses the schema default for a path parameter without example',
        pathTemplate: '/items/{id}',
        parameter: `- name: id
  in: path
  required: true
  schema:
    type: string
    default: abc`,
        uri: '/items/abc',
      },
      {
        name: 'uses the schema default for a query parameter without example',
        pathTemplate: '/items',
        parameter: `- name: page
  in: query
  schema:
    type: integer
    default: 7`,
        uri: '/items?page=7',
      },
      {
        name: 'prefers a parameter example over the schema default',
        pathTemplate: '/items/{id}',
        parameter: `- name: id
  in: path
  required: true
  example: fromexample
  schema:
    type: string
    default: fromdefault`,
        uri: '/items/fromexample',
      },
      {
        name: 'prefers a schema example over the schema default',
        pathTemplate: '/items/{id}',
        parameter: `- name: id
  in: path
  required: true
  schema:
    type: string
    example: fromschemaexample
    default: fromdefault`,
        uri: '/items/fromschemaexample',
      },
    ].forEach(({
      name,
      pathTemplate,
      parameter,
      uri,
    }) => {
      it(name, () => {
        const compileResult = compileOpenAPI31(createAPI(pathTemplate, parameter));

        assert.equal(compileResult.transactions[0].request.uri, uri);
      });
    });
  });

  describe('OpenAPI 3.1 header derivation', () => {
    it('derives a response header value from examples', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Headers API
  version: '1.0'
paths:
  /a:
    get:
      responses:
        '200':
          description: OK
          headers:
            X-Plural:
              schema:
                type: string
              examples:
                first:
                  value: two
`);
      assert.deepEqual(compileResult.transactions[0].response.headers, [
        { name: 'X-Plural', value: 'two' },
      ]);
    });

    it('derives a response header value from a schema default', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Headers API
  version: '1.0'
paths:
  /a:
    get:
      responses:
        '200':
          description: OK
          headers:
            X-Default:
              schema:
                type: string
                default: three
`);
      assert.deepEqual(compileResult.transactions[0].response.headers, [
        { name: 'X-Default', value: 'three' },
      ]);
    });

    it('compiles request header parameters into request headers', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Headers API
  version: '1.0'
paths:
  /b:
    get:
      parameters:
        - name: X-Api-Key
          in: header
          schema:
            type: string
            default: secret
      responses:
        '200':
          description: OK
`);
      assert.deepEqual(compileResult.transactions[0].request.headers, [
        { name: 'X-Api-Key', value: 'secret' },
      ]);
    });

    it('combines cookie parameters into a single Cookie header', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Headers API
  version: '1.0'
paths:
  /b:
    get:
      parameters:
        - name: session
          in: cookie
          schema:
            type: string
            default: abc123
        - name: theme
          in: cookie
          schema:
            type: string
            example: dark
      responses:
        '200':
          description: OK
`);
      assert.deepEqual(compileResult.transactions[0].request.headers, [
        { name: 'Cookie', value: 'session=abc123; theme=dark' },
      ]);
    });
  });

  describe('OpenAPI 3.1 multiple response content types', () => {
    it('emits one transaction per response content type', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Content API
  version: '1.0'
paths:
  /things:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
            text/csv:
              schema:
                type: string
`);
      assert.equal(compileResult.transactions.length, 2);
      assert.deepEqual(
        compileResult.transactions.map((t) => t.response.headers[0]),
        [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Content-Type', value: 'text/csv' },
        ]
      );
    });
  });

  describe('OpenAPI 3.1 multiple request content types', () => {
    it('emits the cartesian product of request and response content types', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Content API
  version: '1.0'
paths:
  /things:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
          application/xml:
            schema:
              type: object
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
            text/csv:
              schema:
                type: string
`);
      const pairs = compileResult.transactions.map((t) => ({
        req: t.request.headers.find((h) => h.name === 'Content-Type').value,
        res: t.response.headers.find((h) => h.name === 'Content-Type').value,
      }));
      assert.deepEqual(pairs, [
        { req: 'application/json', res: 'application/json' },
        { req: 'application/json', res: 'text/csv' },
        { req: 'application/xml', res: 'application/json' },
        { req: 'application/xml', res: 'text/csv' },
      ]);
    });
  });

  describe('OpenAPI 3.1 unresolved references', () => {
    it('emits an error annotation and no transaction for an unresolvable $ref', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Ref API
  version: '1.0'
paths:
  /things:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Missing'
`);
      assert.equal(compileResult.transactions.length, 0);
      assert.deepEqual(compileResult.annotations, [
        {
          type: 'error',
          component: 'apiDescriptionParser',
          message: 'Unresolved reference "#/components/schemas/Missing"',
          location: null,
        },
      ]);
    });

    it('compiles normally when the $ref resolves', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Ref API
  version: '1.0'
components:
  schemas:
    Thing:
      type: object
      properties:
        id:
          type: string
paths:
  /things:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Thing'
`);
      assert.equal(compileResult.annotations.length, 0);
      assert.equal(compileResult.transactions.length, 1);
    });

    it('detects a transitive unresolvable $ref through a resolvable component', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Ref API
  version: '1.0'
components:
  schemas:
    Outer:
      type: object
      properties:
        inner:
          $ref: '#/components/schemas/Inner'
paths:
  /things:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Outer'
`);
      assert.equal(compileResult.transactions.length, 0);
      assert.deepEqual(compileResult.annotations, [
        {
          type: 'error',
          component: 'apiDescriptionParser',
          message: 'Unresolved reference "#/components/schemas/Inner"',
          location: null,
        },
      ]);
    });
  });

  describe('OpenAPI 3.1 recursive schemas', () => {
    it('terminates on a self-referential schema', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: Recursive API
  version: '1.0'
components:
  schemas:
    Node:
      type: object
      properties:
        value:
          type: string
        next:
          $ref: '#/components/schemas/Node'
paths:
  /nodes:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Node'
`);
      assert.equal(compileResult.transactions.length, 1);
      assert.equal(compileResult.transactions[0].response.body, '{"value":""}');
      const schema = JSON.parse(compileResult.transactions[0].response.schema);
      assert.deepEqual(schema.properties.next, {});
    });
  });

  describe('OpenAPI 3.1 allOf composition', () => {
    it('merges allOf subschema samples into the response body', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.1.0
info:
  title: AllOf API
  version: '1.0'
paths:
  /things:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      id:
                        type: string
                  - type: object
                    properties:
                      age:
                        type: integer
`);
      assert.equal(compileResult.transactions[0].response.body, '{"id":"","age":0}');
    });
  });

  describe('with response schema', () => {
    let compileResult;

    before((done) => {
      const apiDescription = fs.readFileSync(
        path.join(__dirname, '../fixtures/openapi3/response-schema.yml'),
        'utf8'
      );
      parse(apiDescription, (err, parseResult) => {
        if (err) {
          done(err);
          return;
        }
        compileResult = compile(
          parseResult.mediaType,
          parseResult.apiElements,
          'response-schema.yml'
        );
        done();
      });
    });

    it('produces two transactions', () => {
      assert.jsonSchema(compileResult, createCompileResultSchema({
        transactions: 2,
      }));
    });

    context('the first transaction', () => {
      it('has the body in response data', () => {
        assert.ok(compileResult.transactions[0].response.body);
        assert.doesNotThrow(() => JSON.parse(compileResult.transactions[0].response.body));
      });
      it('has the schema in response data', () => {
        assert.ok(compileResult.transactions[0].response.schema);
        assert.doesNotThrow(() => JSON.parse(compileResult.transactions[0].response.schema));
      });
    });

    context('the second transaction', () => {
      it('has no body in response data', () => {
        assert.notOk(compileResult.transactions[1].response.body);
      });
      it('has the schema in response data', () => {
        assert.ok(compileResult.transactions[1].response.schema);
        assert.doesNotThrow(() => JSON.parse(compileResult.transactions[1].response.schema));
      });
    });
  });

  describe("with 'multipart/form-data' message bodies", () => {
    const expectedBody = [
      '--CUSTOM-BOUNDARY',
      'Content-Disposition: form-data; name="text"',
      'Content-Type: text/plain',
      '',
      'test equals to 42',
      '--CUSTOM-BOUNDARY',
      'Content-Disposition: form-data; name="json"',
      'Content-Type: application/json',
      '',
      '{"test": 42}',
      '',
      '--CUSTOM-BOUNDARY--',
      '',
    ].join('\r\n');
    let compileResult;

    before((done) => {
      const apiDescription = fs.readFileSync(
        path.join(__dirname, '../fixtures/openapi3/multipart-form-data.yml'),
        'utf8'
      );
      parse(apiDescription, (err, parseResult) => {
        if (err) {
          done(err);
          return;
        }
        compileResult = compile(
          parseResult.mediaType,
          parseResult.apiElements,
          'multipart-form-data.yml'
        );
        done();
      });
    });

    it('produces no annotations and 1 transaction', () => {
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: 0,
        transactions: 1,
      }));
    });

    context('the transaction', () => {
      it('has the expected request body', () => {
        assert.deepEqual(compileResult.transactions[0].request.body, expectedBody);
      });
      it('has the expected response body', () => {
        assert.deepEqual(compileResult.transactions[0].response.body, expectedBody);
      });
    });
  });

  describe('OpenAPI 3.2', () => {
    it('routes a 3.2 document through the in-house compiler', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.2.0
info: { title: T, version: '1.0' }
paths:
  /things/{id}:
    get:
      parameters:
        - { name: id, in: path, required: true, schema: { type: string, example: abc } }
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema: { type: object, properties: { id: { type: string } } }
`);
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: 0,
        transactions: 1,
      }));
      assert.equal(compileResult.transactions[0].request.method, 'GET');
      assert.equal(compileResult.transactions[0].request.uri, '/things/abc');
      assert.equal(
        JSON.parse(compileResult.transactions[0].response.schema).$schema,
        'https://spec.openapis.org/oas/3.1/dialect/base'
      );
    });

    it('compiles the QUERY method, including its request body', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.2.0
info: { title: T, version: '1.0' }
paths:
  /search:
    query:
      requestBody:
        content:
          application/json:
            schema: { type: object, properties: { q: { type: string, example: hi } } }
      responses:
        '200': { description: ok }
`);
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: 0,
        transactions: 1,
      }));
      assert.equal(compileResult.transactions[0].request.method, 'QUERY');
      assert.deepEqual(compileResult.transactions[0].request.headers, [
        { name: 'Content-Type', value: 'application/json' },
      ]);
      assert.equal(compileResult.transactions[0].request.body, '{"q":"hi"}');
    });

    it('compiles additionalOperations using the method key verbatim', () => {
      const compileResult = compileOpenAPI31(`
openapi: 3.2.0
info: { title: T, version: '1.0' }
paths:
  /cache:
    additionalOperations:
      PURGE:
        responses:
          '204': { description: gone }
`);
      assert.jsonSchema(compileResult, createCompileResultSchema({
        annotations: 0,
        transactions: 1,
      }));
      assert.equal(compileResult.transactions[0].request.method, 'PURGE');
      assert.equal(compileResult.transactions[0].response.status, '204');
    });
  });
});
