import { ValidationError } from './types';

// Formats ajv validation errors into gavel@9.1.5's JSON-validation message
// style, e.g.:
//
//   At '/name' Invalid type: number (expected string)
//   At '/items/0/id' Missing required property: id
//   At '/content-type' No enum match for: "text/plain"
//
// This mirrors `formatJSONSchema202012Error` in `lib/TransactionRunner.js` (the
// formatter Dredd already uses for OpenAPI 3.1 bodies, deliberately shaped to
// match gavel). Keeping the body validator on the same formatter is what lets
// ajv stand in for gavel's bespoke JSON validator without message drift.

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

export default function formatJsonSchemaError(error: any): ValidationError {
  const pointer = error.instancePath || '';
  const extraProperty = getErrorProperty(error);
  const location = extraProperty ? `${pointer}/${extraProperty}` : pointer;

  let message: string;
  switch (error.keyword) {
    case 'type':
      message = `At '${location}' Invalid type: ${getDataType(
        error.data,
      )} (expected ${error.params.type})`;
      break;
    case 'required':
      message = `At '${location}' Missing required property: ${extraProperty}`;
      break;
    case 'enum':
      message = `At '${location}' No enum match for: "${error.data}"`;
      break;
    default:
      message = `At '${location}' ${error.message}`;
  }

  return {
    message,
    location: {
      pointer: location,
      property: location.split('/').filter(Boolean),
    },
  };
}
