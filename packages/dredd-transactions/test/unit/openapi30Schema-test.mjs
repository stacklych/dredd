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

  // Same document compiled through both compile paths (3.0 adapter and the
  // in-house 3.1/3.2 compiler) must attach the same response schemas.
  ['3.0.3', '3.1.0'].forEach((version) => {
    describe(`compile() response schemas, OpenAPI ${version}`, () => {
      const source = [
        `openapi: "${version}"`,
        'info: {title: API, version: "1"}',
        'paths:',
        '  /things/{id}:',
        '    summary: Things',
        '    parameters:',
        '      - {name: id, in: path, required: true, example: "1", schema: {type: string}}',
        '    get:',
        '      parameters:',
        '        - {name: q, in: query, example: a, schema: {type: string}}',
        '      responses:',
        '        "200":',
        '          description: ok',
        '          content:',
        '            application/json:',
        '              schema: {type: object, required: [id]}',
        '              example: {id: 1}',
        '            application/problem+json:',
        '              schema: {type: object}',
        '              example: {}',
        '            text/plain:',
        '              schema: {type: string}',
        '              example: hello',
        '            application/xml:',
        '              schema: {type: object}',
        '              example: "<a/>"',
      ].join('\n');

      let schemas;
      before((done) => {
        compileSource(source, (err, result) => {
          if (err) {
            done(err);
            return;
          }
          schemas = {};
          result.transactions.forEach((transaction) => {
            const contentType = transaction.response.headers
              .find((header) => header.name.toLowerCase() === 'content-type').value;
            schemas[contentType] = transaction.response.schema;
          });
          done();
        });
      });

      it('attaches the schema when the Path Item has a summary', () => {
        assert.deepInclude(JSON.parse(schemas['application/json']), { required: ['id'] });
      });

      it('attaches the schema to a +json media type', () => {
        assert.isString(schemas['application/problem+json']);
      });

      it('does not attach a schema to text/plain', () => {
        assert.isUndefined(schemas['text/plain']);
      });

      it('does not attach a schema to application/xml', () => {
        assert.isUndefined(schemas['application/xml']);
      });
    });
  });
});
