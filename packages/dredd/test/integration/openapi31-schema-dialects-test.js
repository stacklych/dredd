import { assert } from 'chai';

import Dredd from '../../lib/Dredd';
import { runDreddWithServer, createServer } from './helpers';

// A 3.1 document whose `jsonSchemaDialect` (or a schema's own `$schema`)
// chooses the JSON Schema dialect the response body is validated with.
function createDocument({ jsonSchemaDialect, schemaDialect } = {}) {
  return `
openapi: 3.1.0
${jsonSchemaDialect ? `jsonSchemaDialect: '${jsonSchemaDialect}'\n` : ''}info:
  title: Dialects
  version: '1.0'
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
paths:
  /pet:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                ${schemaDialect ? `$schema: '${schemaDialect}'` : ''}
                $ref: '#/components/schemas/Pet'
                required: [name]
`;
}

function run(document, body, callback) {
  const app = createServer();
  app.get('/pet', (req, res) => {
    // Node's setHeader, unlike Express's res.set(), adds no charset.
    res.setHeader('Content-Type', 'application/json');
    res.status(200).end(JSON.stringify(body));
  });
  const dredd = new Dredd({
    apiDescriptions: [{ location: 'dialects.yaml', content: document }],
  });
  runDreddWithServer(dredd, app, callback);
}

describe('OpenAPI 3.1 JSON Schema dialects and $ref siblings', () => {
  [
    ['the OpenAPI 3.1 base dialect', {}],
    [
      'JSON Schema 2019-09 via jsonSchemaDialect',
      { jsonSchemaDialect: 'https://json-schema.org/draft/2019-09/schema' },
    ],
    [
      'JSON Schema 2020-12 with a trailing #',
      { schemaDialect: 'https://json-schema.org/draft/2020-12/schema#' },
    ],
  ].forEach(([title, dialect]) => {
    describe(`with ${title}`, () => {
      let valid;
      let invalid;

      before((done) => {
        run(createDocument(dialect), { name: 'Rex' }, (error, info) => {
          valid = info;
          if (error) {
            done(error);
            return;
          }
          run(createDocument(dialect), {}, (error2, info2) => {
            invalid = info2;
            done(error2);
          });
        });
      });

      it('passes a matching body', () =>
        assert.deepInclude(valid.dredd.stats, {
          tests: 1,
          passes: 1,
          errors: 0,
        }));

      it('fails a body that misses a property required next to $ref', () => {
        assert.deepInclude(invalid.dredd.stats, {
          tests: 1,
          failures: 1,
          errors: 0,
        });
        assert.include(
          invalid.dredd.logging,
          'Missing required property: name',
        );
      });
    });
  });

  describe('with an unsupported dialect', () => {
    let info;

    before((done) => {
      run(
        createDocument({
          jsonSchemaDialect: 'http://json-schema.org/draft-04/schema#',
        }),
        { name: 'Rex' },
        (error, runtimeInfo) => {
          info = runtimeInfo;
          done(error);
        },
      );
    });

    it('fails the test instead of erroring', () =>
      assert.deepInclude(info.dredd.stats, {
        tests: 1,
        failures: 1,
        errors: 0,
      }));

    it('names the unsupported dialect', () =>
      assert.include(
        info.dredd.logging,
        "JSON Schema dialect 'http://json-schema.org/draft-04/schema#' is not supported",
      ));
  });
});
