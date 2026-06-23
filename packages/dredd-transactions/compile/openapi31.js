import compileTransactionName from './compileTransactionName.js';

// `query` is the OpenAPI 3.2 QUERY operation (a safe, idempotent method that
// may carry a request body). Other non-fixed-field methods arrive via the
// 3.2 `additionalOperations` map (see collectOperations).
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
const OAS_31_DIALECT = 'https://spec.openapis.org/oas/3.1/dialect/base';

function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(document, ref) {
  return ref
    .slice(2)
    .split('/')
    .map(decodePointerSegment)
    .reduce(
      (current, segment) => (current && typeof current === 'object' ? current[segment] : undefined),
      document
    );
}

function resolveRef(document, value) {
  if (!value || typeof value !== 'object' || !value.$ref) {
    return value;
  }

  const { $ref } = value;
  if (!$ref.startsWith('#/')) {
    return value;
  }

  const resolved = resolvePointer(document, $ref);
  return typeof resolved === 'undefined' ? value : resolved;
}

// Collects internal ('#/…') references within an object subtree that fail to
// resolve, following resolvable references into their targets so transitive
// breaks are caught too. External references (not starting with '#/') are left
// untouched, and the `seen` set guards against reference cycles.
function findUnresolvedRefs(document, node, found, seen) {
  if (!node || typeof node !== 'object' || seen.has(node)) {
    return;
  }
  seen.add(node);

  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/')) {
    const resolved = resolvePointer(document, node.$ref);
    if (typeof resolved === 'undefined') {
      if (!found.includes(node.$ref)) {
        found.push(node.$ref);
      }
      return;
    }
    // Follow the reference into its target to catch transitive breaks (a
    // resolvable component that itself references a missing one). The `seen`
    // set keeps recursive/self-referential schemas safe.
    findUnresolvedRefs(document, resolved, found, seen);
    return;
  }

  Object.keys(node).forEach((key) => findUnresolvedRefs(document, node[key], found, seen));
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

function findFirstExample(document, examples) {
  if (!examples || typeof examples !== 'object') {
    return undefined;
  }

  const firstKey = Object.keys(examples)[0];
  if (!firstKey) {
    return undefined;
  }

  const example = resolveRef(document, examples[firstKey]);
  return example ? example.value : undefined;
}

function schemaTypes(schema) {
  const type = schema && schema.type;
  if (Array.isArray(type)) {
    return type;
  }
  if (typeof type === 'string') {
    return [type];
  }
  if (schema && schema.properties) {
    return ['object'];
  }
  if (schema && schema.items) {
    return ['array'];
  }
  return [];
}

function sampleFromSchema(document, schema, seen = new Set()) {
  const resolvedSchema = resolveRef(document, schema);
  if (!resolvedSchema || typeof resolvedSchema !== 'object') {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(resolvedSchema, 'example')) {
    return resolvedSchema.example;
  }
  if (Object.prototype.hasOwnProperty.call(resolvedSchema, 'default')) {
    return resolvedSchema.default;
  }
  if (Object.prototype.hasOwnProperty.call(resolvedSchema, 'const')) {
    return resolvedSchema.const;
  }
  if (resolvedSchema.enum && resolvedSchema.enum.length) {
    return resolvedSchema.enum[0];
  }

  // Beyond here we descend into sub-schemas; a schema reachable from itself
  // would recurse forever, so stop (omit the value) once it is already being
  // sampled along the current path.
  if (seen.has(resolvedSchema)) {
    return undefined;
  }
  seen.add(resolvedSchema);

  let sample;
  if (resolvedSchema.allOf && resolvedSchema.allOf.length) {
    // `allOf` requires satisfying every subschema, so merge their object
    // samples into a single example, then layer on any sibling properties.
    const samples = resolvedSchema.allOf.map(
      (subSchema) => sampleFromSchema(document, subSchema, seen)
    );
    const objects = samples.filter(
      (value) => value && typeof value === 'object' && !Array.isArray(value)
    );
    if (Object.keys(resolvedSchema.properties || {}).length) {
      objects.push(Object.keys(resolvedSchema.properties).reduce(
        (result, name) => Object.assign(result, {
          [name]: sampleFromSchema(document, resolvedSchema.properties[name], seen),
        }),
        {}
      ));
    }
    if (objects.length) {
      sample = Object.assign({}, ...objects);
    } else {
      // No object subschemas to merge (e.g. `allOf` wrapping a single
      // primitive or `$ref`); fall back to the first defined sample so the
      // schema still yields a body instead of nothing.
      sample = samples.find((value) => typeof value !== 'undefined');
    }
  } else if (resolvedSchema.oneOf && resolvedSchema.oneOf.length) {
    sample = sampleFromSchema(document, resolvedSchema.oneOf[0], seen);
  } else if (resolvedSchema.anyOf && resolvedSchema.anyOf.length) {
    sample = sampleFromSchema(document, resolvedSchema.anyOf[0], seen);
  } else {
    const type = schemaTypes(resolvedSchema).filter((item) => item !== 'null')[0];
    switch (type) {
      case 'object':
        sample = Object.keys(resolvedSchema.properties || {}).reduce(
          (result, name) => Object.assign(result, {
            [name]: sampleFromSchema(document, resolvedSchema.properties[name], seen),
          }),
          {}
        );
        break;
      case 'array':
        sample = [sampleFromSchema(document, resolvedSchema.items, seen)];
        break;
      case 'integer':
      case 'number':
        sample = 0;
        break;
      case 'boolean':
        sample = false;
        break;
      case 'string':
        sample = '';
        break;
      default:
        sample = undefined;
    }
  }

  seen.delete(resolvedSchema);
  return sample;
}

function sampleFromParameter(document, parameter) {
  if (Object.prototype.hasOwnProperty.call(parameter, 'example')) {
    return parameter.example;
  }
  if (parameter.examples) {
    const example = findFirstExample(document, parameter.examples);
    if (typeof example !== 'undefined') {
      return example;
    }
  }
  return sampleFromSchema(document, parameter.schema);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function encodePart(value) {
  return encodeURIComponent(String(value));
}

function serializePrimitive(value) {
  return encodePart(value);
}

function serializeArray(value, delimiter) {
  return value.map(encodePart).join(delimiter);
}

function serializeObject(value, delimiter, assignmentDelimiter) {
  return Object.keys(value)
    .reduce((serialized, key) => {
      if (assignmentDelimiter === delimiter) {
        return serialized.concat([encodePart(key), encodePart(value[key])]);
      }
      return serialized.concat(
        `${encodePart(key)}${assignmentDelimiter}${encodePart(value[key])}`
      );
    }, [])
    .join(delimiter);
}

function serializeSimpleParameter(value, explode) {
  if (Array.isArray(value)) {
    return serializeArray(value, ',');
  }
  if (value && typeof value === 'object') {
    return serializeObject(value, ',', explode ? '=' : ',');
  }
  return serializePrimitive(value);
}

function serializeFormParameter(name, value, explode) {
  const serializedName = encodePart(name);

  if (Array.isArray(value)) {
    if (explode) {
      return value.map((item) => `${serializedName}=${encodePart(item)}`);
    }
    return [`${serializedName}=${serializeArray(value, ',')}`];
  }

  if (value && typeof value === 'object') {
    if (explode) {
      return Object.keys(value)
        .map((key) => `${encodePart(key)}=${encodePart(value[key])}`);
    }
    return [`${serializedName}=${serializeObject(value, ',', ',')}`];
  }

  return [`${serializedName}=${serializePrimitive(value)}`];
}

function getDefaultStyle(location) {
  return location === 'path' ? 'simple' : 'form';
}

function getDefaultExplode(style) {
  return style === 'form';
}

function compileParameters(document, pathTemplate, parameters) {
  let uri = pathTemplate;
  const query = [];

  parameters.forEach((parameter) => {
    const resolvedParameter = resolveRef(document, parameter);
    const value = sampleFromParameter(document, resolvedParameter);
    if (typeof value === 'undefined') {
      return;
    }

    if (resolvedParameter.in === 'path') {
      const style = resolvedParameter.style || getDefaultStyle(resolvedParameter.in);
      const explode = Object.prototype.hasOwnProperty.call(resolvedParameter, 'explode')
        ? resolvedParameter.explode
        : getDefaultExplode(style);
      const serializedValue = style === 'simple'
        ? serializeSimpleParameter(value, explode)
        : serializePrimitive(value);
      uri = uri.replace(
        new RegExp(`{${escapeRegExp(resolvedParameter.name)}}`, 'g'),
        serializedValue
      );
    } else if (resolvedParameter.in === 'query') {
      const style = resolvedParameter.style || getDefaultStyle(resolvedParameter.in);
      const explode = Object.prototype.hasOwnProperty.call(resolvedParameter, 'explode')
        ? resolvedParameter.explode
        : getDefaultExplode(style);
      if (style === 'form') {
        query.push(...serializeFormParameter(resolvedParameter.name, value, explode));
      } else {
        query.push(`${encodePart(resolvedParameter.name)}=${serializePrimitive(value)}`);
      }
    }
  });

  if (query.length) {
    uri = `${uri}?${query.join('&')}`;
  }

  return uri;
}

function compileHeaderParameters(document, parameters) {
  return parameters.reduce((headers, parameter) => {
    const resolvedParameter = resolveRef(document, parameter);
    if (resolvedParameter.in !== 'header') {
      return headers;
    }
    const value = sampleFromParameter(document, resolvedParameter);
    if (typeof value === 'undefined') {
      return headers;
    }
    headers.push({ name: resolvedParameter.name, value: String(value) });
    return headers;
  }, []);
}

function compileCookieParameters(document, parameters) {
  const cookies = parameters.reduce((pairs, parameter) => {
    const resolvedParameter = resolveRef(document, parameter);
    if (resolvedParameter.in !== 'cookie') {
      return pairs;
    }
    const value = sampleFromParameter(document, resolvedParameter);
    if (typeof value === 'undefined') {
      return pairs;
    }

    let serializedValue;
    if (Array.isArray(value)) {
      serializedValue = serializeArray(value, ',');
    } else if (value && typeof value === 'object') {
      serializedValue = serializeObject(value, ',', ',');
    } else {
      serializedValue = serializePrimitive(value);
    }

    pairs.push(`${encodePart(resolvedParameter.name)}=${serializedValue}`);
    return pairs;
  }, []);

  // All cookie parameters are carried in a single Cookie request header.
  return cookies.length ? [{ name: 'Cookie', value: cookies.join('; ') }] : [];
}

function isJSONMediaType(mediaType) {
  const type = mediaType.split(';')[0].trim();
  return type === 'application/json' || type.endsWith('+json');
}

function bodyFromMediaType(document, mediaType, mediaTypeObject) {
  if (Object.prototype.hasOwnProperty.call(mediaTypeObject, 'example')) {
    return isJSONMediaType(mediaType)
      ? JSON.stringify(mediaTypeObject.example)
      : String(mediaTypeObject.example);
  }

  const example = findFirstExample(document, mediaTypeObject.examples);
  if (typeof example !== 'undefined') {
    return isJSONMediaType(mediaType) ? JSON.stringify(example) : String(example);
  }

  const sample = sampleFromSchema(document, mediaTypeObject.schema);
  if (typeof sample === 'undefined') {
    return undefined;
  }
  return isJSONMediaType(mediaType) ? JSON.stringify(sample) : String(sample);
}

function getAllContents(content) {
  const mediaTypes = Object.keys(content || {});
  if (!mediaTypes.length) {
    return [null];
  }
  return mediaTypes.map((mediaType) => ({ mediaType, mediaTypeObject: content[mediaType] }));
}

function compileRequests(document, method, uri, operation, leadingHeaders) {
  const content = operation.requestBody && resolveRef(document, operation.requestBody).content;

  // One request per request-body content type (matching the parser-backed
  // path); an operation without a request body yields a single request.
  return getAllContents(content).map((requestContent) => {
    const request = {
      method,
      uri,
      headers: [...(leadingHeaders || [])],
      body: '',
    };

    if (requestContent) {
      request.headers.push({ name: 'Content-Type', value: requestContent.mediaType });
      const body = bodyFromMediaType(
        document, requestContent.mediaType, requestContent.mediaTypeObject
      );
      if (typeof body !== 'undefined') {
        request.body = body;
      }
    }

    return request;
  });
}

function compileHeaders(document, headers) {
  return Object.keys(headers || {}).map((name) => {
    const header = resolveRef(document, headers[name]);
    // A Header Object exposes the same value sources as a Parameter Object
    // (example, then examples, then schema).
    const value = sampleFromParameter(document, header);
    return { name, value: typeof value === 'undefined' ? '' : String(value) };
  });
}

function compileResponse(document, status, response, content) {
  const resolvedResponse = resolveRef(document, response);
  const compiledResponse = {
    status: status === 'default' ? '200' : String(status),
    headers: compileHeaders(document, resolvedResponse.headers),
  };

  if (content) {
    compiledResponse.headers.unshift({ name: 'Content-Type', value: content.mediaType });
    const body = bodyFromMediaType(document, content.mediaType, content.mediaTypeObject);
    if (typeof body !== 'undefined') {
      compiledResponse.body = body;
    }
    if (content.mediaTypeObject.schema) {
      const schema = cloneWithoutRef(document, content.mediaTypeObject.schema);
      if (schema && typeof schema === 'object' && !schema.$schema) {
        schema.$schema = document.jsonSchemaDialect || OAS_31_DIALECT;
      }
      compiledResponse.schema = JSON.stringify(schema);
    }
  }

  return compiledResponse;
}

function compileOrigin(filename, document, pathTemplate, method, response) {
  return {
    filename: filename || '',
    apiName: (document.info && document.info.title) || filename || '',
    resourceGroupName: '',
    resourceName: pathTemplate,
    actionName: method,
    exampleName: [
      response.status,
      response.headers
        .filter((header) => header.name.toLowerCase() === 'content-type')
        .map((header) => header.value)[0],
    ].filter(Boolean).join(' > '),
  };
}

function compileOperation(document, filename, pathTemplate, pathItem, method, operation) {
  const parameters = []
    .concat(pathItem.parameters || [])
    .concat(operation.parameters || []);

  // An unresolvable internal reference makes the operation uncompilable; surface
  // it as an error annotation and emit no transactions for it (matching the
  // parser-backed path, which rejects the operation outright).
  const unresolvedRefs = [];
  const seen = new Set();
  findUnresolvedRefs(document, operation, unresolvedRefs, seen);
  parameters.forEach((parameter) => findUnresolvedRefs(document, parameter, unresolvedRefs, seen));
  if (unresolvedRefs.length) {
    return {
      transactions: [],
      annotations: unresolvedRefs.map((ref) => ({
        type: 'error',
        component: 'apiDescriptionParser',
        message: `Unresolved reference "${ref}"`,
        location: null,
      })),
    };
  }

  const uri = compileParameters(document, pathTemplate, parameters);
  const headerParameters = compileHeaderParameters(document, parameters);
  const cookieHeaders = compileCookieParameters(document, parameters);
  const requests = compileRequests(
    document, method, uri, operation, [...headerParameters, ...cookieHeaders]
  );

  // Cartesian product of request representations and response representations
  // (request-major), matching the parser-backed path. Each response content
  // type yields a transaction; a response without content yields one.
  const transactions = requests.reduce((collected, request) => {
    Object.keys(operation.responses || {}).forEach((status) => {
      const response = resolveRef(document, operation.responses[status]);
      getAllContents(response.content).forEach((content) => {
        const compiledResponse = compileResponse(document, status, response, content);
        const origin = compileOrigin(filename, document, pathTemplate, method, compiledResponse);
        collected.push({
          request,
          response: compiledResponse,
          name: compileTransactionName(origin),
          origin,
        });
      });
    });
    return collected;
  }, []);

  return { transactions, annotations: [] };
}

// Collects the operations of a Path Item as `{ method, operation }`, where
// `method` is the HTTP method exactly as it should be sent. The fixed-field
// methods (including the 3.2 `query` field) are uppercased; the keys of the
// 3.2 `additionalOperations` map are used verbatim, since the spec defines them
// as the method with the capitalization to be sent in the request.
function collectOperations(pathItem) {
  const operations = [];

  METHODS.forEach((method) => {
    if (pathItem[method]) {
      operations.push({ method: method.toUpperCase(), operation: pathItem[method] });
    }
  });

  const additionalOperations = pathItem.additionalOperations || {};
  Object.keys(additionalOperations).forEach((method) => {
    if (additionalOperations[method]) {
      operations.push({ method, operation: additionalOperations[method] });
    }
  });

  return operations;
}

export default function compileOpenAPI31(apiElements, filename) {
  const { document } = apiElements.openapi31;
  const paths = document.paths || {};

  const transactions = [];
  const annotations = [];

  Object.keys(paths).forEach((pathTemplate) => {
    const pathItem = resolveRef(document, paths[pathTemplate]);
    collectOperations(pathItem).forEach(({ method, operation }) => {
      const compiled = compileOperation(
        document, filename, pathTemplate, pathItem, method, operation
      );
      transactions.push(...compiled.transactions);
      annotations.push(...compiled.annotations);
    });
  });

  return {
    mediaType: 'application/vnd.oai.openapi',
    transactions,
    annotations,
  };
};

// Exposed only for unit tests.
export { sampleFromSchema as _sampleFromSchema };
