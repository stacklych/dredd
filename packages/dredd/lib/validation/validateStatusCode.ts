import { ExpectedResponse, FieldValidationResult, RealResponse } from './types';

// Validates the HTTP status code by exact (stringwise) equality, matching
// gavel@9.1.5's TextDiff-based statusCode field:
//
//   match   -> { valid: true,  kind: 'text', errors: [] }
//   mismatch-> { valid: false, kind: 'text',
//                errors: [{ message: "Expected status code '<e>', but got '<a>'." }] }
//
// Both sides are coerced to strings first: dredd-transactions emits the expected
// status as a string ('200') while a real response carries a numeric code.
export default function validateStatusCode(
  expected: ExpectedResponse,
  real: RealResponse,
): FieldValidationResult {
  const expectedCode = `${expected.statusCode}`;
  const actualCode = `${real.statusCode}`;
  const valid = expectedCode === actualCode;

  return {
    valid,
    kind: 'text',
    values: { expected: expectedCode, actual: actualCode },
    errors: valid
      ? []
      : [
          {
            message: `Expected status code '${expectedCode}', but got '${actualCode}'.`,
          },
        ],
  };
}
