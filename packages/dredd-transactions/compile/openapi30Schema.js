// Augments transactions compiled from OpenAPI 3.0 descriptions with response
// body JSON Schemas.
//
// The OpenAPI 3.0 path goes through the API Elements adapter, which (unlike the
// custom OpenAPI 3.1 path) does not expose response body schemas to the
// compiler. Without a schema, Gavel can only check structure, not data types.
// Here we read the schema straight from the source document for each compiled
// transaction (matched by path, method, status and content type) and attach it,
// after normalizing the handful of places where OpenAPI 3.0 schema syntax
// differs from the JSON Schema dialect Gavel validates against.

/* eslint-disable no-param-reassign */

const OAS_DIALECT = 'https://spec.openapis.org/oas/3.1/dialect/base';

function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveRef(document, value) {
  if (!value || typeof value !== 'object' || !value.$ref) {
    return value;
  }
  const { $ref } = value;
  if (!$ref.startsWith('#/')) {
    return value;
  }
  return $ref
    .slice(2)
    .split('/')
    .map(decodePointerSegment)
    .reduce((current, segment) => (current ? current[segment] : undefined), document) || value;
}

function cloneWithoutRef(document, value, seen = new Set()) {
  const resolved = resolveRef(document, value);
  if (!resolved || typeof resolved !== 'object') {
    return resolved;
  }
  // A schema reachable from itself would inline forever; once a node is already
  // being expanded along the current path, collapse further repeats to an empty
  // (match-anything) schema so recursive schemas terminate.
  if (seen.has(resolved)) {
    return {};
  }
  seen.add(resolved);
  const clone = Array.isArray(resolved)
    ? resolved.map((item) => cloneWithoutRef(document, item, seen))
    : Object.keys(resolved).reduce((result, key) => Object.assign(result, {
      [key]: cloneWithoutRef(document, resolved[key], seen),
    }), {});
  seen.delete(resolved);
  return clone;
}

// Convert an already-cloned OpenAPI 3.0 schema in place into a schema valid
// under the JSON Schema dialect Gavel uses.
function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    schema.forEach(normalizeSchema);
    return schema;
  }

  // OpenAPI 3.0 `nullable: true` -> add "null" to the JSON Schema type.
  if (schema.nullable === true) {
    if (typeof schema.type === 'string') {
      schema.type = [schema.type, 'null'];
    } else if (Array.isArray(schema.type) && !schema.type.includes('null')) {
      schema.type.push('null');
    }
  }
  delete schema.nullable;

  // OpenAPI 3.0 uses boolean exclusiveMinimum/Maximum paired with
  // minimum/maximum; JSON Schema uses a numeric exclusive bound.
  if (typeof schema.exclusiveMinimum === 'boolean') {
    if (schema.exclusiveMinimum === true && typeof schema.minimum === 'number') {
      schema.exclusiveMinimum = schema.minimum;
      delete schema.minimum;
    } else {
      delete schema.exclusiveMinimum;
    }
  }
  if (typeof schema.exclusiveMaximum === 'boolean') {
    if (schema.exclusiveMaximum === true && typeof schema.maximum === 'number') {
      schema.exclusiveMaximum = schema.maximum;
      delete schema.maximum;
    } else {
      delete schema.exclusiveMaximum;
    }
  }

  // Recurse into nested schemas.
  if (schema.properties && typeof schema.properties === 'object') {
    Object.keys(schema.properties).forEach((name) => normalizeSchema(schema.properties[name]));
  }
  if (schema.items) {
    normalizeSchema(schema.items);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    normalizeSchema(schema.additionalProperties);
  }
  ['allOf', 'anyOf', 'oneOf'].forEach((keyword) => {
    if (Array.isArray(schema[keyword])) {
      schema[keyword].forEach(normalizeSchema);
    }
  });
  if (schema.not) {
    normalizeSchema(schema.not);
  }

  return schema;
}

function findContentSchema(responseObject, contentType) {
  const content = responseObject && responseObject.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }
  const keys = Object.keys(content);
  if (!keys.length) {
    return undefined;
  }

  let key;
  if (contentType) {
    const base = contentType.split(';')[0].trim().toLowerCase();
    key = keys.find((candidate) => candidate.toLowerCase() === contentType.toLowerCase())
      || keys.find((candidate) => candidate.split(';')[0].trim().toLowerCase() === base);
  }
  if (!key) {
    [key] = keys;
  }

  return content[key] ? content[key].schema : undefined;
}

function buildResponseSchema(document, operation, status, contentType) {
  const responses = operation.responses || {};
  const responseObject = resolveRef(
    document,
    Object.prototype.hasOwnProperty.call(responses, status)
      ? responses[status]
      : responses.default
  );
  if (!responseObject) {
    return undefined;
  }

  const rawSchema = findContentSchema(responseObject, contentType);
  if (!rawSchema) {
    return undefined;
  }

  const schema = normalizeSchema(cloneWithoutRef(document, rawSchema));
  if (schema && typeof schema === 'object' && !Array.isArray(schema) && !schema.$schema) {
    schema.$schema = OAS_DIALECT;
  }
  return JSON.stringify(schema);
}

function contentTypeOf(headers) {
  return (headers || [])
    .filter((header) => header.name.toLowerCase() === 'content-type')
    .map((header) => header.value)[0];
}

// Mutates the given transactions, attaching response.schema where the
// OpenAPI 3.0 document defines a response body schema and none is present yet.
function augmentWithOpenAPI30Schemas(transactions, document) {
  const paths = (document && document.paths) || {};

  transactions.forEach((transaction) => {
    if (!transaction || !transaction.response || transaction.response.schema) {
      return;
    }
    const pathTemplate = transaction.origin && transaction.origin.resourceName;
    const method = transaction.request && transaction.request.method
      ? transaction.request.method.toLowerCase()
      : undefined;
    if (!pathTemplate || !method) {
      return;
    }

    const pathItem = resolveRef(document, paths[pathTemplate]);
    const operation = pathItem ? pathItem[method] : undefined;
    if (!operation) {
      return;
    }

    const schema = buildResponseSchema(
      document,
      operation,
      String(transaction.response.status),
      contentTypeOf(transaction.response.headers)
    );
    if (schema) {
      transaction.response.schema = schema;
    }
  });

  return transactions;
}

export default augmentWithOpenAPI30Schemas;
export { normalizeSchema };
