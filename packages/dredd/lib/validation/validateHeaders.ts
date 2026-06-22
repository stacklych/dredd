import {
  ExpectedResponse,
  FieldValidationResult,
  RealResponse,
  ValidationError,
} from './types';

// Headers whose *value* gavel@9.1.5 enforces (via a JSON Schema `enum`). Every
// other expected header is checked for presence only — a value mismatch on, say,
// `location` or `etag` passes. These are the content-negotiation headers.
const VALUE_ENFORCED_HEADERS = new Set(['content-type', 'accept']);

function lowerKeyMap(
  headers: Record<string, string> = {},
): Record<string, string> {
  return Object.keys(headers).reduce<Record<string, string>>((acc, key) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {});
}

// Validates expected response headers against the real response, reproducing
// gavel's HeadersJsonExample validator:
//
//   - header keys are matched case-insensitively;
//   - every expected header must be present (else "Missing required property");
//   - for `content-type`/`accept`, the value must match case-insensitively
//     (else "No enum match for: \"<actual>\""); parameters such as `charset`
//     are part of the value and must match exactly;
//   - extra real headers are allowed.
export default function validateHeaders(
  expected: ExpectedResponse,
  real: RealResponse,
): FieldValidationResult {
  const expectedHeaders = expected.headers || {};
  const realByLowerKey = lowerKeyMap(real.headers);
  const errors: ValidationError[] = [];

  Object.keys(expectedHeaders).forEach((rawKey) => {
    const key = rawKey.toLowerCase();
    const location = { pointer: `/${key}`, property: [key] };

    if (!Object.prototype.hasOwnProperty.call(realByLowerKey, key)) {
      errors.push({
        message: `At '/${key}' Missing required property: ${key}`,
        location,
      });
      return;
    }

    if (VALUE_ENFORCED_HEADERS.has(key)) {
      const actualValue = realByLowerKey[key];
      const expectedValue = expectedHeaders[rawKey];
      if (`${actualValue}`.toLowerCase() !== `${expectedValue}`.toLowerCase()) {
        errors.push({
          message: `At '/${key}' No enum match for: "${actualValue}"`,
          location,
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    kind: 'json',
    values: { expected: expectedHeaders, actual: real.headers || {} },
    errors,
  };
}
