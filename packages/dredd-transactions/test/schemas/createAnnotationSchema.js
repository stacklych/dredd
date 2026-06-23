import createLocationSchema from './createLocationSchema.js';
import createOriginSchema from './createOriginSchema.js';

const TYPES = ['error', 'warning'];

// Ajv `pattern` must be a string. Convert a RegExp message matcher into an
// equivalent pattern string; case-insensitive matchers are expanded into
// character classes since JSON Schema patterns carry no flags.
function toPattern(message) {
  if (message instanceof RegExp) {
    return message.flags.includes('i')
      ? message.source.replace(/[a-zA-Z]/g, (ch) => `[${ch.toLowerCase()}${ch.toUpperCase()}]`)
      : message.source;
  }
  return message;
}

export default function createAnnotationSchema(options = {}) {
  // Either filename string or undefined (= doesn't matter)
  const { filename } = options;

  // options.message should be substring or RegExp
  const messageSchema = { type: 'string' };
  if (options.message) { messageSchema.pattern = toPattern(options.message); }

  const parseAnnotationSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: options.type ? [options.type] : TYPES,
      },
      component: {
        type: 'string',
        enum: ['apiDescriptionParser'],
      },
      message: messageSchema,
      location: createLocationSchema(),
    },
    required: ['type', 'component', 'message', 'location'],
    additionalProperties: false,
  };
  if (options.component === 'apiDescriptionParser') {
    return parseAnnotationSchema;
  }

  const compileAnnotationSchema = {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: options.type ? [options.type] : TYPES,
      },
      component: {
        type: 'string',
        enum: options.component ? [options.component] : ['parametersValidation', 'uriTemplateExpansion'],
      },
      message: messageSchema,
      location: { type: 'null' }, // https://github.com/apiaryio/dredd-transactions/issues/275
      name: { type: 'string' },
      origin: createOriginSchema({ filename }),
    },
    required: ['type', 'component', 'message', 'location', 'name', 'origin'],
    additionalProperties: false,
  };
  if (['parametersValidation', 'uriTemplateExpansion'].includes(options.component)) {
    return compileAnnotationSchema;
  }

  return { anyOf: [parseAnnotationSchema, compileAnnotationSchema] };
};
