import Ajv from 'ajv';

import {
  ExpectedResponse,
  FieldValidationResult,
  RealResponse,
} from './types';
import formatJsonSchemaError from './formatJsonSchemaError';
import formatGavelSchemaError from './formatGavelSchemaError';
import generateSchemaFromExample from './generateSchemaFromExample';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const addFormats = require('ajv-formats');

function getContentType(headers: Record<string, string> = {}): string | null {
  const key = Object.keys(headers).find(
    (name) => name.toLowerCase() === 'content-type',
  );
  return key ? headers[key] : null;
}

function isParseableJson(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch (e) {
    return false;
  }
}

// Resolves the media type gavel attributes to a side: the explicit
// `Content-Type` header if present, otherwise sniffed from the body
// (`application/json` when it parses as JSON, else `text/plain`).
function resolveMediaType(
  headers: Record<string, string> = {},
  body = '',
): string {
  const contentType = getContentType(headers);
  if (contentType) {
    return contentType;
  }
  return isParseableJson(body) ? 'application/json' : 'text/plain';
}

function isJsonMediaType(mediaType: string): boolean {
  const base = mediaType.split(';')[0].trim().toLowerCase();
  return base === 'application/json' || base.endsWith('+json');
}

// Validates a JSON body against a structure-only schema generated from the
// expected example, formatting errors in gavel's style.
function validateJsonBody(
  expectedBody: string,
  realBody: string,
  realMediaType: string,
  values: FieldValidationResult['values'],
): FieldValidationResult {
  let actual: unknown;
  try {
    actual = JSON.parse(realBody);
  } catch (e) {
    return {
      valid: false,
      kind: null,
      values,
      errors: [
        {
          message: `Can't validate: actual body 'Content-Type' header is '${realMediaType}' but body is not a parseable JSON:\n${
            (e as Error).message
          }`,
        },
      ],
    };
  }

  const schema = generateSchemaFromExample(JSON.parse(expectedBody));
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
  const validate = ajv.compile(schema);
  validate(actual);

  const errors = (validate.errors || []).map(formatJsonSchemaError);
  return { valid: errors.length === 0, kind: 'json', values, errors };
}

// Validates a real body against an explicit JSON Schema (the `bodySchema`
// path), reproducing gavel's hybrid error formatting. `bodySchema` may be a
// schema object, a JSON string, or a boolean schema.
function validateAgainstSchema(
  bodySchema: object | string | boolean,
  realBody: string,
  realMediaType: string,
  values: FieldValidationResult['values'],
): FieldValidationResult {
  let actual: unknown;
  try {
    actual = JSON.parse(realBody);
  } catch (e) {
    return {
      valid: false,
      kind: null,
      values,
      errors: [
        {
          message: `Can't validate: actual body 'Content-Type' header is '${realMediaType}' but body is not a parseable JSON:\n${
            (e as Error).message
          }`,
        },
      ],
    };
  }

  const schema =
    typeof bodySchema === 'string' ? JSON.parse(bodySchema) : bodySchema;
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
  (addFormats.default || addFormats)(ajv);
  const validate = ajv.compile(schema);
  validate(actual);

  const errors = (validate.errors || []).map(formatGavelSchemaError);
  return { valid: errors.length === 0, kind: 'json', values, errors };
}

// Validates an expected response body against the real one, reproducing gavel's
// media-type-negotiated body field. Returns `undefined` when there is no
// expected body (and no schema) — in that case gavel emits no `body` field at
// all. An explicit `bodySchema` takes precedence over the example body.
export default function validateBody(
  expected: ExpectedResponse,
  real: RealResponse,
): FieldValidationResult | undefined {
  const realBodyForSchema = real.body || '';

  if (expected.bodySchema != null) {
    const realMediaType = resolveMediaType(real.headers, realBodyForSchema);
    return validateAgainstSchema(
      expected.bodySchema,
      realBodyForSchema,
      realMediaType,
      { actual: realBodyForSchema, expected: expected.body },
    );
  }

  if (expected.body == null || expected.body === '') {
    return undefined;
  }

  const expectedBody = expected.body;
  const realBody = real.body || '';
  const expectedMediaType = resolveMediaType(expected.headers, expectedBody);
  const realMediaType = resolveMediaType(real.headers, realBody);
  const values = { actual: realBody, expected: expectedBody };

  const expectedIsJson = isJsonMediaType(expectedMediaType);
  const realIsJson = isJsonMediaType(realMediaType);

  if (expectedIsJson && realIsJson) {
    return validateJsonBody(expectedBody, realBody, realMediaType, values);
  }

  if (!expectedIsJson && !realIsJson) {
    const valid = expectedBody === realBody;
    return {
      valid,
      kind: 'text',
      values,
      errors: valid
        ? []
        : [{ message: 'Actual and expected data do not match.' }],
    };
  }

  return {
    valid: false,
    kind: null,
    values,
    errors: [
      {
        message: `Can't validate actual media type '${realMediaType}' against the expected media type '${expectedMediaType}'.`,
      },
    ],
  };
}
