import { assert } from 'chai';

import parse from '../../parse/index.js';
import compile from '../../compile/index.js';

function compileSource(source) {
  return new Promise((resolve, reject) => {
    parse(source, (err, parseResult) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(compile(parseResult.mediaType, parseResult.apiElements, 'apiDescription.yaml'));
    });
  });
}

function document(version, pathItem) {
  return [
    `openapi: "${version}"`,
    'info: {title: API, version: "1"}',
    'paths:',
    ...pathItem.map((line) => `  ${line}`),
  ].join('\n');
}

const errors = (result) => result.annotations
  .filter((annotation) => annotation.type === 'error')
  .map((annotation) => annotation.message);

describe('OpenAPI 3.1/3.2 parameters', () => {
  describe('operation parameters override path-level parameters', () => {
    const pathItem = [
      '/items/{id}:',
      '  parameters:',
      '    - {name: id, in: path, required: true, example: path-level, schema: {type: string}}',
      '    - {name: limit, in: query, example: 10, schema: {type: integer}}',
      '    - {name: X-V, in: header, example: "1", schema: {type: string}}',
      '  get:',
      '    parameters:',
      '      - {name: id, in: path, required: true, example: op-level, schema: {type: string}}',
      '      - {name: limit, in: query, example: 20, schema: {type: integer}}',
      '      - {name: X-V, in: header, example: "2", schema: {type: string}}',
      '    responses:',
      '      "204": {description: ok}',
    ];

    ['3.0.3', '3.1.0'].forEach((version) => {
      it(`uses the operation-level values (OpenAPI ${version})`, async () => {
        const result = await compileSource(document(version, pathItem));
        const { request } = result.transactions[0];
        assert.equal(request.uri, '/items/op-level?limit=20');
        assert.deepEqual(
          request.headers.filter((header) => header.name === 'X-V'),
          [{ name: 'X-V', value: '2' }]
        );
      });
    });
  });

  describe('parameters without a stated value', () => {
    ['3.0.3', '3.1.0'].forEach((version) => {
      it(`reports a required path parameter and emits no transaction (OpenAPI ${version})`, async () => {
        const result = await compileSource(document(version, [
          '/users/{id}:',
          '  get:',
          '    parameters:',
          '      - {name: id, in: path, required: true, schema: {type: string}}',
          '    responses:',
          '      "204": {description: ok}',
        ]));
        assert.lengthOf(result.transactions, 0);
        assert.include(errors(result), "Required URI parameter 'id' has no example or default value.");
      });

      it(`reports a required query parameter (OpenAPI ${version})`, async () => {
        const result = await compileSource(document(version, [
          '/users:',
          '  get:',
          '    parameters:',
          '      - {name: q, in: query, required: true, schema: {type: string}}',
          '    responses:',
          '      "204": {description: ok}',
        ]));
        assert.lengthOf(result.transactions, 0);
        assert.include(errors(result), "Required URI parameter 'q' has no example or default value.");
      });

      it(`omits an optional query parameter (OpenAPI ${version})`, async () => {
        const result = await compileSource(document(version, [
          '/users:',
          '  get:',
          '    parameters:',
          '      - {name: filter, in: query, schema: {type: string}}',
          '    responses:',
          '      "204": {description: ok}',
        ]));
        assert.equal(result.transactions[0].request.uri, '/users');
      });
    });

    it('omits an optional header parameter (OpenAPI 3.1)', async () => {
      const result = await compileSource(document('3.1.0', [
        '/users:',
        '  get:',
        '    parameters:',
        '      - {name: X-Opt, in: header, schema: {type: string}}',
        '    responses:',
        '      "204": {description: ok}',
      ]));
      assert.deepEqual(result.transactions[0].request.headers, []);
    });

    it('uses a schema enum, default or const as a stated value (OpenAPI 3.1)', async () => {
      const result = await compileSource(document('3.1.0', [
        '/users/{id}:',
        '  get:',
        '    parameters:',
        '      - {name: id, in: path, required: true, schema: {type: string, default: u1}}',
        '      - {name: sort, in: query, schema: {type: string, enum: [asc, desc]}}',
        '      - {name: v, in: query, schema: {const: 2}}',
        '    responses:',
        '      "204": {description: ok}',
      ]));
      assert.equal(result.transactions[0].request.uri, '/users/u1?sort=asc&v=2');
    });

    it('reports a path placeholder with no declared parameter (OpenAPI 3.1)', async () => {
      const result = await compileSource(document('3.1.0', [
        '/users/{id}:',
        '  get:',
        '    responses:',
        '      "204": {description: ok}',
      ]));
      assert.lengthOf(result.transactions, 0);
      assert.include(errors(result), "Required URI parameter 'id' has no example or default value.");
    });
  });

  describe('parameter styles (OpenAPI 3.1)', () => {
    let result;
    before(async () => {
      result = await compileSource(document('3.1.0', [
        '/s/{a}/{b}/{c}:',
        '  get:',
        '    parameters:',
        '      - {name: a, in: path, required: true, style: label, example: [1, 2], schema: {type: array}}',
        '      - {name: b, in: path, required: true, style: matrix, explode: true, example: [1, 2], schema: {type: array}}',
        '      - {name: c, in: path, required: true, style: matrix, example: x, schema: {type: string}}',
        '      - {name: p, in: query, style: pipeDelimited, explode: false, example: [x, y], schema: {type: array}}',
        '      - {name: sp, in: query, style: spaceDelimited, explode: false, example: [x, y], schema: {type: array}}',
        '      - {name: f, in: query, style: deepObject, explode: true, example: {a: 1, b: z}, schema: {type: object}}',
        '    responses:',
        '      "204": {description: ok}',
      ]));
    });

    it('serializes label and matrix path parameters', () => {
      assert.match(result.transactions[0].request.uri, /^\/s\/\.1,2\/;b=1;b=2\/;c=x\?/);
    });

    it('serializes pipeDelimited, spaceDelimited and deepObject query parameters', () => {
      assert.equal(
        result.transactions[0].request.uri.split('?')[1],
        'p=x|y&sp=x%20y&f%5Ba%5D=1&f%5Bb%5D=z'
      );
    });

    it('warns about a style that is not valid for the location', async () => {
      const invalid = await compileSource(document('3.1.0', [
        '/s:',
        '  get:',
        '    parameters:',
        '      - {name: q, in: query, style: matrix, example: x, schema: {type: string}}',
        '    responses:',
        '      "204": {description: ok}',
      ]));
      assert.equal(invalid.transactions[0].request.uri, '/s?q=x');
      assert.isTrue(invalid.annotations.some((annotation) => annotation.type === 'warning'
        && annotation.message.includes("style 'matrix'")));
    });
  });
});
