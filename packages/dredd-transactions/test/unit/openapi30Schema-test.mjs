import { assert } from 'chai';

import parse from '../../parse/index.js';
import compile from '../../compile/index.js';
import { normalizeSchema } from '../../compile/openapi30Schema.js';

function compileSource(source, callback) {
  parse(source, (err, parseResult) => {
    if (err) {
      callback(err);
      return;
    }
    callback(
      null,
      compile(parseResult.mediaType, parseResult.apiElements, 'apiDescription.yaml')
    );
  });
}

describe('OpenAPI 3.0 schema augmentation', () => {
  describe('normalizeSchema()', () => {
    it('turns nullable: true into a JSON Schema null type', () => {
      assert.deepEqual(
        normalizeSchema({ type: 'string', nullable: true }),
        { type: ['string', 'null'] }
      );
    });

    it('drops nullable: false', () => {
      assert.deepEqual(
        normalizeSchema({ type: 'string', nullable: false }),
        { type: 'string' }
      );
    });

    it('turns a boolean exclusiveMinimum into a numeric bound', () => {
      assert.deepEqual(
        normalizeSchema({ type: 'integer', minimum: 1, exclusiveMinimum: true }),
        { type: 'integer', exclusiveMinimum: 1 }
      );
    });

    it('recurses into nested properties', () => {
      assert.deepEqual(
        normalizeSchema({
          type: 'object',
          properties: { a: { type: 'string', nullable: true } },
        }),
        { type: 'object', properties: { a: { type: ['string', 'null'] } } }
      );
    });
  });

  describe('compile() with an OpenAPI 3.0 document', () => {
    it('attaches a response schema for a typed response', (done) => {
      const source = [
        'openapi: "3.0.3"',
        'info: {title: API, version: "1"}',
        'paths:',
        '  /x:',
        '    get:',
        '      responses:',
        '        "200":',
        '          description: ok',
        '          content:',
        '            application/json:',
        '              schema: {type: object, properties: {n: {type: integer}}}',
      ].join('\n');

      compileSource(source, (err, result) => {
        if (err) {
          done(err);
          return;
        }
        const { schema } = result.transactions[0].response;
        assert.isString(schema);
        const parsed = JSON.parse(schema);
        assert.propertyVal(parsed, 'type', 'object');
        assert.propertyVal(parsed.properties.n, 'type', 'integer');
        done();
      });
    });

    it('does not attach a schema for an example-only response', (done) => {
      const source = [
        'openapi: "3.0.3"',
        'info: {title: API, version: "1"}',
        'paths:',
        '  /x:',
        '    get:',
        '      responses:',
        '        "200":',
        '          description: ok',
        '          content:',
        '            application/json:',
        '              example: {n: 1}',
      ].join('\n');

      compileSource(source, (err, result) => {
        if (err) {
          done(err);
          return;
        }
        assert.isUndefined(result.transactions[0].response.schema);
        done();
      });
    });

    it('terminates on a self-referential schema instead of overflowing the stack', (done) => {
      const source = [
        'openapi: "3.0.3"',
        'info: {title: API, version: "1"}',
        'components:',
        '  schemas:',
        '    Node:',
        '      type: object',
        '      properties:',
        '        value: {type: string}',
        '        next: {$ref: "#/components/schemas/Node"}',
        'paths:',
        '  /nodes:',
        '    get:',
        '      responses:',
        '        "200":',
        '          description: ok',
        '          content:',
        '            application/json:',
        '              schema: {$ref: "#/components/schemas/Node"}',
      ].join('\n');

      compileSource(source, (err, result) => {
        if (err) {
          done(err);
          return;
        }
        const parsed = JSON.parse(result.transactions[0].response.schema);
        assert.propertyVal(parsed.properties.value, 'type', 'string');
        assert.deepEqual(parsed.properties.next, {});
        done();
      });
    });
  });
});

describe('$ref sibling keywords in response schemas', () => {
  const source = (version) => [
    `openapi: "${version}"`,
    'info: {title: API, version: "1"}',
    'components:',
    '  schemas:',
    '    Pet: {type: object, properties: {name: {type: string}}}',
    'paths:',
    '  /pet:',
    '    get:',
    '      responses:',
    '        "200":',
    '          description: ok',
    '          content:',
    '            application/json:',
    '              schema: {$ref: "#/components/schemas/Pet", required: [name]}',
  ].join('\n');

  const compileSchema = (version) => new Promise((resolve, reject) => {
    compileSource(source(version), (err, result) => {
      if (err) { reject(err); return; }
      resolve(JSON.parse(result.transactions[0].response.schema));
    });
  });

  it('keeps keywords next to $ref in OpenAPI 3.1 (JSON Schema 2020-12)', async () => {
    const schema = await compileSchema('3.1.0');
    assert.deepEqual(schema.required, ['name']);
    assert.deepEqual(schema.allOf, [{ type: 'object', properties: { name: { type: 'string' } } }]);
  });

  it('ignores keywords next to $ref in OpenAPI 3.0, as the 3.0 spec requires', async () => {
    const schema = await compileSchema('3.0.3');
    assert.notProperty(schema, 'required');
    assert.propertyVal(schema, 'type', 'object');
  });
});
