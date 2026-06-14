const { assert } = require('chai');

const parse = require('../../parse');
const compile = require('../../compile');
const { normalizeSchema } = require('../../compile/openapi30Schema');

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
  });
});
