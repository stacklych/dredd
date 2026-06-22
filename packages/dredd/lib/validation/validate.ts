import {
  ExpectedResponse,
  RealResponse,
  ValidationResult,
} from './types';
import validateStatusCode from './validateStatusCode';
import validateHeaders from './validateHeaders';
import validateBody from './validateBody';

// In-house replacement for `gavel.validate(expected, real)` (issue #59).
// Produces the same runtime shape as the vendored gavel@9.1.5 bundle:
//
//   { valid, fields: { statusCode, headers, body? } }
//
// `valid` is the conjunction of every validated field. The `body` field is
// omitted entirely when there is no expected body, matching gavel.
export default function validate(
  expected: ExpectedResponse,
  real: RealResponse,
): ValidationResult {
  const fields: ValidationResult['fields'] = {
    statusCode: validateStatusCode(expected, real),
    headers: validateHeaders(expected, real),
  };

  const body = validateBody(expected, real);
  if (body) {
    fields.body = body;
  }

  const valid = Object.keys(fields).every(
    (name) => fields[name as keyof typeof fields]!.valid,
  );

  return { valid, fields };
}
