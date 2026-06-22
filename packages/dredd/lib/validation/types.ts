// Result types for the in-house HTTP validator that replaces the vendored
// Gavel.js bundle (see GitHub issue #59). The shapes here intentionally mirror
// the *runtime* output of `gavel.validate()` (gavel@9.1.5) so the validator is a
// drop-in for `lib/TransactionRunner.js`:
//
//   validate(expected, real) -> { valid, fields: { statusCode, headers, body } }
//
// Each field result carries `valid`, a `kind` tag, the `values` that were
// compared, and a list of `errors` whose `message` strings are surfaced to the
// reporters. Only `valid` and `errors[].message` are read by Dredd itself; the
// full object is forwarded opaquely to the Apiary reporter.

export type FieldKind = 'text' | 'json' | null;

export interface ValidationError {
  message: string;
  // Present on JSON-kind errors (headers, JSON bodies); mirrors gavel's pointer
  // into the offending location. Omitted for text-kind errors.
  location?: {
    pointer: string;
    property: string[];
  };
}

export interface FieldValidationResult {
  valid: boolean;
  kind: FieldKind;
  values: {
    expected?: unknown;
    actual?: unknown;
  };
  errors: ValidationError[];
}

export interface ValidationResult {
  valid: boolean;
  fields: {
    statusCode?: FieldValidationResult;
    headers?: FieldValidationResult;
    body?: FieldValidationResult;
  };
}

// The subset of an expected HTTP response the validator consumes. Mirrors the
// `expected` object assembled in `TransactionRunner.configureTransaction`.
export interface ExpectedResponse {
  statusCode?: string | number;
  headers?: Record<string, string>;
  body?: string;
  // A JSON Schema (object, JSON string, or boolean schema) for the response
  // body. Present for API descriptions that ship an explicit non-2020-12 schema
  // (e.g. JSON Schema Draft 7). When set it takes precedence over `body`, and
  // the real body is validated against it rather than against the example.
  // 2020-12 / OpenAPI-3.1 schemas never reach here — TransactionRunner routes
  // those through its own ajv path before calling the validator.
  bodySchema?: object | string | boolean;
}

// The subset of a real HTTP response the validator consumes.
export interface RealResponse {
  statusCode?: string | number;
  headers?: Record<string, string>;
  body?: string;
}
