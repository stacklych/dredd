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

const source = (version) => [
  `openapi: "${version}"`,
  'info: {title: API, version: "1"}',
  'paths:',
  '  /things:',
  '    summary: Things',
  '    post:',
  '      summary: Create a thing',
  '      requestBody:',
  '        content:',
  '          application/json: {example: {a: 1}}',
  '          application/xml: {example: "<a/>"}',
  '      responses:',
  '        "200":',
  '          description: created',
  '          headers:',
  '            Location: {required: true, schema: {type: string}, example: /things/1}',
  '            X-Rate-Limit: {schema: {type: integer}, example: 5}',
  '          content:',
  '            application/json: {example: {a: 1}}',
  '        "2XX": {description: other success}',
  '        default:',
  '          description: error',
  '          content:',
  '            application/json: {example: {a: 1}}',
  '  /items:',
  '    get:',
  '      responses:',
  '        "200":',
  '          description: ok',
  '          content:',
  '            application/json: {example: {a: 1}}',
  '            text/plain: {example: a}',
].join('\n');

const header = (headers, name) => headers
  .filter((item) => item.name.toLowerCase() === name.toLowerCase())
  .map((item) => item.value);

// The same document compiled as 3.0 (API Elements adapter) and as 3.1 (the
// in-house compiler) must give the same transactions.
['3.0.3', '3.1.0'].forEach((version) => {
  describe(`OpenAPI ${version} responses and transaction names`, () => {
    let result;
    before(async () => {
      result = await compileSource(source(version));
    });

    // 3.0 names use the summaries; 3.1/3.2 names use the path and method.
    const prefix = version.startsWith('3.0') ? 'API > Things > Create a thing' : 'API > /things > POST';

    it('names transactions as documented for the OpenAPI version', () => {
      assert.equal(result.transactions[0].name, `${prefix} > 200 > application/json`);
    });

    it('falls back to the path template and method without summaries', () => {
      assert.include(result.transactions.map((t) => t.name), 'API > /items > GET > 200 > text/plain');
    });

    it('gives every transaction a unique name', () => {
      const names = result.transactions.map((transaction) => transaction.name);
      assert.deepEqual(names, [...new Set(names)]);
      assert.includeMembers(names, [
        `${prefix} > 200 > application/json`,
        `${prefix} > 200 > application/json > default`,
        `${prefix} > 200 > application/json > request application/xml`,
        `${prefix} > 200 > application/json > request application/xml > default`,
      ]);
    });

    it('keeps the origin consistent with the name', () => {
      result.transactions.forEach((transaction) => {
        assert.isTrue(transaction.name.endsWith(transaction.origin.exampleName));
      });
    });

    it('sends an Accept header for the response media type', () => {
      const items = result.transactions.filter((t) => t.request.uri === '/items');
      assert.deepEqual(items.map((t) => header(t.request.headers, 'Accept')), [
        ['application/json'], ['text/plain'],
      ]);
    });

    it('reports a status code range and compiles no transaction for it', () => {
      assert.notInclude(result.transactions.map((t) => t.response.status), '2XX');
      assert.isTrue(result.annotations.some((annotation) => annotation.type === 'warning'
        && /range/.test(annotation.message)));
    });

    it('expects only required response headers', () => {
      const { headers } = result.transactions[0].response;
      assert.lengthOf(header(headers, 'Location'), 1);
      assert.lengthOf(header(headers, 'X-Rate-Limit'), 0);
    });
  });
});

describe('OpenAPI 3.1 request bodies for non-JSON media types', () => {
  const body = async (mediaType, example) => {
    const result = await compileSource([
      'openapi: "3.1.0"',
      'info: {title: API, version: "1"}',
      'paths:',
      '  /form:',
      '    post:',
      '      requestBody:',
      '        content:',
      `          ${mediaType}: {example: ${example}}`,
      '      responses:',
      '        "204": {description: ok}',
    ].join('\n'));
    return result.transactions[0].request.body;
  };

  it('form-encodes an object for application/x-www-form-urlencoded', async () => {
    assert.equal(
      await body('application/x-www-form-urlencoded', '{user: a b, tags: [x, y]}'),
      'user=a+b&tags=x&tags=y'
    );
  });

  it('sends no body rather than "[object Object]" for other media types', async () => {
    assert.equal(await body('multipart/form-data', '{user: a}'), '');
  });

  it('sends a string example as is', async () => {
    assert.equal(await body('text/plain', 'hello'), 'hello');
  });
});
