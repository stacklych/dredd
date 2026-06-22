import { ValidationError } from './types';

// Formats an ajv error for the explicit-`bodySchema` path the way gavel@9.1.5
// did. Gavel used a *hybrid* renderer: a few keywords were translated into its
// own "At '<location>' ..." phrasing, while every other keyword fell through to
// the raw ajv message, prefixed with `data` + the instance path:
//
//   required -> At '/0/name' Missing required property: name
//   type     -> At '/0/name' Invalid type: number (expected string)
//   enum     -> At '/x' No enum match for: "z"
//   const    -> data/0/type should be equal to constant
//   (other)  -> data/x should NOT have additional properties
//
// Gavel bundled an older ajv whose messages used "should" where ajv 8 uses
// "must"; we normalise that single modal so the common fall-through messages
// (const, additionalProperties, pattern, format, numeric bounds) match exactly.
// The pass/fail verdict is driven by ajv's schema semantics and is identical
// either way — only the wording of a few uncommon keywords can differ.

function getErrorProperty(error: any): string | null {
  switch (error.keyword) {
    case 'required':
      return error.params.missingProperty;
    case 'additionalProperties':
      return error.params.additionalProperty;
    default:
      return null;
  }
}

function getDataType(value: unknown): string | null {
  return value === null ? null : typeof value;
}

function toLegacyAjvWording(message = ''): string {
  return message.replace(/\bmust\b/g, 'should');
}

export default function formatGavelSchemaError(error: any): ValidationError {
  const pointer = error.instancePath || '';

  switch (error.keyword) {
    case 'type':
      return {
        message: `At '${pointer}' Invalid type: ${getDataType(
          error.data,
        )} (expected ${error.params.type})`,
      };
    case 'required': {
      const property = getErrorProperty(error);
      return {
        message: `At '${pointer}/${property}' Missing required property: ${property}`,
      };
    }
    case 'enum':
      return {
        message: `At '${pointer}' No enum match for: "${error.data}"`,
      };
    default:
      return {
        message: `data${pointer} ${toLegacyAjvWording(error.message)}`,
      };
  }
}
