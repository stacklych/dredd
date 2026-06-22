import { assert } from 'chai';

// Regression coverage for the in-house HTTP validator (lib/validation/*) that
// replaced the vendored gavel.js bundle (issue #59). The expected verdicts and
// error-message strings below are the ones gavel@9.1.5 produced; equivalence
// was confirmed against the live bundle while it still existed (differential
// tests). With the bundle removed these are locked in as explicit snapshots.
import validate from '../../../lib/validation/validate';
import validateStatusCode from '../../../lib/validation/validateStatusCode';
import validateHeaders from '../../../lib/validation/validateHeaders';
import validateBody from '../../../lib/validation/validateBody';

function messages(fieldResult) {
  return ((fieldResult && fieldResult.errors) || []).map((e) => e.message);
}

const J = { 'content-type': 'application/json' };

describe('in-house validator', () => {
  describe('statusCode', () => {
    it('passes on equal codes (numeric vs string)', () => {
      const result = validateStatusCode({ statusCode: '200' }, { statusCode: 200 });
      assert.isTrue(result.valid);
      assert.deepEqual(messages(result), []);
    });

    it('fails with gavel-style message on mismatch', () => {
      const result = validateStatusCode({ statusCode: '200' }, { statusCode: 400 });
      assert.isFalse(result.valid);
      assert.deepEqual(messages(result), [
        "Expected status code '200', but got '400'.",
      ]);
    });
  });

  describe('headers', () => {
    const run = (expectedHeaders, realHeaders) =>
      validateHeaders({ headers: expectedHeaders }, { headers: realHeaders });

    it('passes when content-type matches', () => {
      assert.isTrue(run(J, J).valid);
    });

    it('fails content-type value mismatch with enum message', () => {
      const result = run(J, { 'content-type': 'text/plain' });
      assert.isFalse(result.valid);
      assert.deepEqual(messages(result), [
        'At \'/content-type\' No enum match for: "text/plain"',
      ]);
    });

    it('treats content-type value case-insensitively but charset-sensitively', () => {
      assert.isTrue(run({ 'content-type': 'Application/JSON' }, J).valid);
      assert.isFalse(
        run(J, { 'content-type': 'application/json; charset=utf-8' }).valid,
      );
    });

    it('enforces the accept header value too', () => {
      assert.deepEqual(messages(run({ accept: 'a' }, { accept: 'b' })), [
        'At \'/accept\' No enum match for: "b"',
      ]);
    });

    it('ignores values of non content-negotiation headers', () => {
      assert.isTrue(run({ 'x-foo': 'a' }, { 'x-foo': 'b' }).valid);
    });

    it('matches header keys case-insensitively', () => {
      assert.isTrue(run({ 'X-Foo': 'a' }, { 'x-foo': 'a' }).valid);
    });

    it('reports a missing expected header', () => {
      const result = run({ 'content-type': 'application/json', 'x-need': 'v' }, J);
      assert.deepEqual(messages(result), [
        "At '/x-need' Missing required property: x-need",
      ]);
    });

    it('allows extra (superset) real headers', () => {
      assert.isTrue(run(J, { 'content-type': 'application/json', 'x-extra': '1' }).valid);
    });
  });

  describe('body (example based)', () => {
    const run = (eb, rb, eh = J, rh = J) =>
      validateBody({ headers: eh, body: eb }, { headers: rh, body: rb });

    it('omits the body field entirely when there is no expected body', () => {
      assert.isUndefined(validateBody({ headers: J }, { headers: J, body: '{"a":1}' }));
    });

    it('enforces key presence but not scalar values or types', () => {
      assert.isTrue(run('{"a":1}', '{"a":2}').valid);
      assert.isTrue(run('{"a":1}', '{"a":"s"}').valid);
      assert.isTrue(run('{"a":1}', '{"a":1,"b":2}').valid);
    });

    it('reports missing keys, including nested and in arrays of objects', () => {
      assert.deepEqual(messages(run('{"a":1,"b":2}', '{"a":1}')), [
        "At '/b' Missing required property: b",
      ]);
      assert.deepEqual(messages(run('{"a":{"x":1,"y":2}}', '{"a":{"x":1}}')), [
        "At '/a/y' Missing required property: y",
      ]);
      assert.deepEqual(messages(run('{"a":[{"x":1}]}', '{"a":[{}]}')), [
        "At '/a/0/x' Missing required property: x",
      ]);
    });

    it('enforces container type at the root', () => {
      assert.deepEqual(messages(run('{"a":1}', '5')), [
        "At '' Invalid type: number (expected object)",
      ]);
    });

    it('compares text bodies exactly', () => {
      const T = { 'content-type': 'text/plain' };
      assert.isTrue(run('Foo', 'Foo', T, T).valid);
      assert.deepEqual(messages(run('Foo', 'Bar', T, T)), [
        'Actual and expected data do not match.',
      ]);
    });

    it('errors when media types belong to different categories', () => {
      const result = run('{"a":1}', 'Foo', J, { 'content-type': 'text/plain' });
      assert.deepEqual(messages(result), [
        "Can't validate actual media type 'text/plain' against the expected media type 'application/json'.",
      ]);
    });

    it('sniffs media type from the body when no content-type header is present', () => {
      assert.deepEqual(messages(run('{"a":1,"b":2}', '{"a":1}', {}, {})), [
        "At '/b' Missing required property: b",
      ]);
      assert.deepEqual(messages(run('{"a":1}', 'plain text', {}, {})), [
        "Can't validate actual media type 'text/plain' against the expected media type 'application/json'.",
      ]);
    });
  });

  describe('body (explicit JSON Schema / bodySchema)', () => {
    const D = 'http://json-schema.org/draft-07/schema#';
    const draft7 = {
      $schema: D,
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { const: 'bulldozer' }, name: { type: 'string' } },
        required: ['type', 'name'],
      },
    };
    const run = (bodySchema, realBody) =>
      validateBody({ headers: J, bodySchema }, { headers: J, body: realBody });

    it('passes a conforming body', () => {
      assert.isTrue(run(draft7, '[{"type":"bulldozer","name":"willy"}]').valid);
    });

    it('uses the "At" format for type/required/enum keywords', () => {
      assert.deepEqual(messages(run(draft7, '[{"type":"bulldozer"}]')), [
        "At '/0/name' Missing required property: name",
      ]);
      assert.deepEqual(messages(run(draft7, '[{"type":"bulldozer","name":5}]')), [
        "At '/0/name' Invalid type: number (expected string)",
      ]);
      assert.deepEqual(
        messages(
          run(
            { $schema: D, type: 'object', properties: { x: { enum: ['a', 'b'] } } },
            '{"x":"z"}',
          ),
        ),
        ['At \'/x\' No enum match for: "z"'],
      );
    });

    it('uses the data-prefixed fallback format for other keywords', () => {
      assert.deepEqual(messages(run(draft7, '[{"type":"unknown","name":"willy"}]')), [
        'data/0/type should be equal to constant',
      ]);
    });

    it('accepts a schema passed as a JSON string', () => {
      assert.deepEqual(
        messages(run(JSON.stringify(draft7), '[{"type":"unknown","name":"willy"}]')),
        ['data/0/type should be equal to constant'],
      );
    });

    it('accepts a boolean schema', () => {
      assert.isTrue(run(true, '{"anything":1}').valid);
    });
  });

  describe('validate() top-level verdict', () => {
    it('is the conjunction of every validated field', () => {
      assert.isTrue(
        validate(
          { headers: J, body: '{"a":1}', statusCode: '200' },
          { headers: J, body: '{"a":1}', statusCode: 200 },
        ).valid,
      );
      assert.isFalse(
        validate(
          { headers: J, body: '{"a":1}', statusCode: '200' },
          { headers: J, body: '{"a":1}', statusCode: 400 },
        ).valid,
      );
    });

    it('omits the body field when there is no expected body', () => {
      const result = validate(
        { headers: J, statusCode: '200' },
        { headers: J, statusCode: 200, body: '{"a":1}' },
      );
      assert.notProperty(result.fields, 'body');
      assert.property(result.fields, 'statusCode');
      assert.property(result.fields, 'headers');
    });
  });
});
