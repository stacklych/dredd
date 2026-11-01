import compileTransactionName from './compileTransactionName.js';
import disambiguateNames from './disambiguateNames.js';

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
  // In OpenAPI 3.1/3.2 (JSON Schema 2020-12) `$ref` is an applicator: keywords
  // next to it apply as well. Inline the target as an `allOf` member so the
  // sibling keywords are kept, e.g. {$ref, required} -> {required, allOf: [target]}.
  if (value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.$ref === 'string' && Object.keys(value).length > 1
    && resolveRef(document, value) !== value) {
    const { $ref, ...siblings } = value;
    const clone = cloneWithoutRef(document, siblings, seen);
    const target = cloneWithoutRef(document, { $ref }, seen);
    clone.allOf = [target, ...(Array.isArray(clone.allOf) ? clone.allOf : [])];
    return clone;
  }
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

// Resolves the first Example Object of an `examples` map (following a $ref).
function firstExampleObject(document, examples) {
  if (!examples || typeof examples !== 'object') {
    return undefined;
  }

  const firstKey = Object.keys(examples)[0];
  if (!firstKey) {
    return undefined;
  }

  const example = resolveRef(document, examples[firstKey]);
  return example && typeof example === 'object' ? example : undefined;
}

function findFirstExample(document, examples) {
  const example = firstExampleObject(document, examples);
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

// A value the document states for a parameter: its example(s), or the schema's
// example, default, const or first enum value. Unlike sampleFromParameter this
// never invents a type-based placeholder ('' or 0), so a parameter without a
// stated value can be omitted (optional) or reported (required).
function explicitParameterValue(document, parameter) {
  if (Object.prototype.hasOwnProperty.call(parameter, 'example')) {
    return parameter.example;
  }
  if (parameter.examples) {
    const example = findFirstExample(document, parameter.examples);
    if (typeof example !== 'undefined') {
      return example;
    }
  }
  const schema = resolveRef(document, parameter.schema);
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'example')) {
    return schema.example;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'default')) {
    return schema.default;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return schema.const;
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return schema.enum[0];
  }
  return undefined;
}

// Merges Path Item and Operation parameters. An operation parameter replaces a
// path-level parameter with the same name and location (OpenAPI 3.x, Path Item
// Object `parameters`). Order: path-level first, then operation-only ones.
function mergeParameters(document, pathParameters, operationParameters) {
  const key = (parameter) => {
    const resolved = resolveRef(document, parameter) || {};
    return `${resolved.in}:${resolved.name}`;
  };
  const merged = [];
  const index = new Map();
  [...(pathParameters || []), ...(operationParameters || [])].forEach((parameter) => {
    const k = key(parameter);
    if (index.has(k)) {
      merged[index.get(k)] = parameter;
    } else {
      index.set(k, merged.length);
      merged.push(parameter);
    }
  });
  return merged;
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

// Path styles (RFC 6570 label `.` and matrix `;` expansions).
function serializeLabelParameter(value, explode) {
  if (Array.isArray(value)) {
    return `.${serializeArray(value, explode ? '.' : ',')}`;
  }
  if (value && typeof value === 'object') {
    return `.${explode ? serializeObject(value, '.', '=') : serializeObject(value, ',', ',')}`;
  }
  return `.${serializePrimitive(value)}`;
}

function serializeMatrixParameter(name, value, explode) {
  const serializedName = encodePart(name);
  if (Array.isArray(value)) {
    return explode
      ? value.map((item) => `;${serializedName}=${encodePart(item)}`).join('')
      : `;${serializedName}=${serializeArray(value, ',')}`;
  }
  if (value && typeof value === 'object') {
    return explode
      ? Object.keys(value).map((key) => `;${encodePart(key)}=${encodePart(value[key])}`).join('')
      : `;${serializedName}=${serializeObject(value, ',', ',')}`;
  }
  return `;${serializedName}=${serializePrimitive(value)}`;
}

// Query styles other than `form`. `spaceDelimited` and `pipeDelimited` join
// array items (explode: false); `deepObject` renders `name[key]=value`.
function serializeDelimitedParameter(name, value, explode, delimiter) {
  const serializedName = encodePart(name);
  if (Array.isArray(value) && !explode) {
    return [`${serializedName}=${serializeArray(value, delimiter)}`];
  }
  return serializeFormParameter(name, value, explode);
}

function serializeDeepObjectParameter(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return Object.keys(value)
    .map((key) => `${encodePart(name)}%5B${encodePart(key)}%5D=${encodePart(value[key])}`);
}

const PATH_STYLES = ['simple', 'label', 'matrix'];
const QUERY_STYLES = ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'];

function getDefaultStyle(location) {
  return location === 'path' ? 'simple' : 'form';
}

function getDefaultExplode(style) {
  return style === 'form';
}

// OpenAPI 3.2 `in: querystring` parameters carry the entire query string in
// their `content` (typically application/x-www-form-urlencoded). Serializes a
// representative value: a serialized example verbatim, else an object example
// or sample form-encoded as `key=value&…`, else a primitive percent-encoded.
function serializeQuerystringParameter(document, parameter) {
  const { content } = parameter;
  if (!content || typeof content !== 'object') {
    return undefined;
  }
  const mediaType = Object.keys(content)[0];
  if (!mediaType) {
    return undefined;
  }
  const mediaTypeObject = content[mediaType] || {};

  const exampleObject = firstExampleObject(document, mediaTypeObject.examples);
  if (exampleObject
    && Object.prototype.hasOwnProperty.call(exampleObject, 'serializedValue')) {
    return String(exampleObject.serializedValue);
  }

  let value;
  if (Object.prototype.hasOwnProperty.call(mediaTypeObject, 'example')) {
    value = mediaTypeObject.example;
  } else if (exampleObject && typeof exampleObject.value !== 'undefined') {
    value = exampleObject.value;
  } else {
    value = sampleFromSchema(document, mediaTypeObject.schema);
  }
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value)
      .map((key) => `${encodePart(key)}=${encodePart(value[key])}`)
      .join('&');
  }
  return encodePart(value);
}

function compileParameters(document, pathTemplate, parameters, annotations) {
  let uri = pathTemplate;
  const query = [];
  const warn = (message) => annotations.push({
    type: 'warning', component: 'parametersValidation', message, location: null,
  });
  const fail = (message) => annotations.push({
    type: 'error', component: 'parametersValidation', message, location: null,
  });

  parameters.forEach((parameter) => {
    const resolvedParameter = resolveRef(document, parameter);

    // OpenAPI 3.2 `in: querystring`: the entire query string, supplied via the
    // parameter's `content` rather than a schema.
    if (resolvedParameter.in === 'querystring') {
      const serialized = serializeQuerystringParameter(document, resolvedParameter);
      if (serialized) {
        query.push(serialized);
      }
      return;
    }
    if (resolvedParameter.in !== 'path' && resolvedParameter.in !== 'query') {
      return;
    }

    const value = explicitParameterValue(document, resolvedParameter);
    if (typeof value === 'undefined') {
      if (resolvedParameter.in === 'path' || resolvedParameter.required) {
        fail(`Required URI parameter '${resolvedParameter.name}' has no example or default value.`);
      }
      return;
    }

    const style = resolvedParameter.style || getDefaultStyle(resolvedParameter.in);
    const explode = Object.prototype.hasOwnProperty.call(resolvedParameter, 'explode')
      ? resolvedParameter.explode
      : getDefaultExplode(style);
    const unsupported = () => warn(
      `Parameter '${resolvedParameter.name}' (in: ${resolvedParameter.in}) uses style `
      + `'${style}', which is not valid for this location; it is serialized as `
      + `'${getDefaultStyle(resolvedParameter.in)}'.`
    );

    if (resolvedParameter.in === 'path') {
      let serializedValue;
      if (style === 'label') {
        serializedValue = serializeLabelParameter(value, explode);
      } else if (style === 'matrix') {
        serializedValue = serializeMatrixParameter(resolvedParameter.name, value, explode);
      } else {
        if (!PATH_STYLES.includes(style)) { unsupported(); }
        serializedValue = serializeSimpleParameter(value, explode);
      }
      uri = uri.replace(
        new RegExp(`{${escapeRegExp(resolvedParameter.name)}}`, 'g'),
        serializedValue
      );
    } else {
      let pairs;
      if (style === 'spaceDelimited') {
        pairs = serializeDelimitedParameter(resolvedParameter.name, value, explode, '%20');
      } else if (style === 'pipeDelimited') {
        pairs = serializeDelimitedParameter(resolvedParameter.name, value, explode, '|');
      } else if (style === 'deepObject') {
        pairs = serializeDeepObjectParameter(resolvedParameter.name, value);
        if (!pairs) {
          warn(`Parameter '${resolvedParameter.name}' uses style 'deepObject', `
            + 'which applies only to object values; it is serialized as \'form\'.');
        }
      } else if (!QUERY_STYLES.includes(style)) {
        unsupported();
      }
      query.push(...(pairs || serializeFormParameter(resolvedParameter.name, value, explode)));
    }
  });

  // A `{name}` left in the path has no declared parameter (or no value); the
  // request would go to a literal '{name}' URL, so report it.
  const leftovers = uri.match(/{[^}]+}/g) || [];
  leftovers.forEach((placeholder) => {
    const name = placeholder.slice(1, -1);
    if (!annotations.some((annotation) => annotation.message.includes(`'${name}'`))) {
      fail(`Required URI parameter '${name}' has no example or default value.`);
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
    const value = explicitParameterValue(document, resolvedParameter);
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
    const value = explicitParameterValue(document, resolvedParameter);
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
  const type = mediaType.split(';')[0].trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
}

// OpenAPI 3.2 sequential/streaming media: a Media Type Object carrying
// `itemSchema` (a schema applied to each item of a stream) or the Server-Sent
// Events media type. Dredd validates whole single responses, not consumed
// streams, so such content is flagged and its body schema is not validated.
function isStreamingMediaType(mediaType, mediaTypeObject) {
  const type = mediaType.split(';')[0].trim().toLowerCase();
  if (type === 'text/event-stream') {
    return true;
  }
  return !!(mediaTypeObject
    && Object.prototype.hasOwnProperty.call(mediaTypeObject, 'itemSchema'));
}

function isFormMediaType(mediaType) {
  return mediaType.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}

// Serializes a body value for the media type: JSON for JSON types, `key=value&…`
// for form-urlencoded objects, the value itself for strings and primitives.
// Any other object (e.g. multipart, XML) has no generic text form, so no body
// is produced rather than the string '[object Object]'.
function serializeBody(mediaType, value) {
  if (typeof value === 'undefined') {
    return undefined;
  }
  if (isJSONMediaType(mediaType)) {
    return JSON.stringify(value);
  }
  if (value && typeof value === 'object') {
    if (isFormMediaType(mediaType) && !Array.isArray(value)) {
      return Object.keys(value)
        .reduce((pairs, key) => pairs.concat(
          serializeFormParameter(key, value[key], true)
            .map((pair) => pair.replace(/%20/g, '+'))
        ), [])
        .join('&');
    }
    return undefined;
  }
  return String(value);
}

function bodyFromMediaType(document, mediaType, mediaTypeObject) {
  if (Object.prototype.hasOwnProperty.call(mediaTypeObject, 'example')) {
    return serializeBody(mediaType, mediaTypeObject.example);
  }

  const exampleObject = firstExampleObject(document, mediaTypeObject.examples);
  if (exampleObject) {
    // OpenAPI 3.2 `serializedValue`: the example is already in serialized form,
    // so use it verbatim instead of re-encoding it.
    if (Object.prototype.hasOwnProperty.call(exampleObject, 'serializedValue')) {
      return String(exampleObject.serializedValue);
    }
    if (typeof exampleObject.value !== 'undefined') {
      return serializeBody(mediaType, exampleObject.value);
    }
  }

  return serializeBody(mediaType, sampleFromSchema(document, mediaTypeObject.schema));
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

// Only headers with `required: true` are expected in the response; OpenAPI
// response headers are optional by default.
function compileHeaders(document, headers) {
  return Object.keys(headers || {}).filter((name) => {
    const header = resolveRef(document, headers[name]);
    return header && header.required === true;
  }).map((name) => {
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
    if (content.mediaTypeObject.schema
      && isJSONMediaType(content.mediaType)
      && !isStreamingMediaType(content.mediaType, content.mediaTypeObject)) {
      const schema = cloneWithoutRef(document, content.mediaTypeObject.schema);
      if (schema && typeof schema === 'object' && !schema.$schema) {
        schema.$schema = document.jsonSchemaDialect || OAS_31_DIALECT;
      }
      compiledResponse.schema = JSON.stringify(schema);
    }
  }

  return compiledResponse;
}

// OpenAPI 3.1/3.2 names use the path template and the method, never the
// summaries (unlike the 3.0 path); see docs/hooks/index.rst. Keeping them
// stable means hooks keyed by name keep matching when a summary is edited.
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

// Surfaces a warning for each OpenAPI 3.2 streaming/sequential media type in the
// operation's request body or responses. Dredd still emits the transaction (so
// the endpoint's method, URI, status, and headers are exercised), but the
// streamed body is not validated.
function collectStreamingAnnotations(document, method, pathTemplate, operation) {
  const annotations = [];
  const note = (mediaType, where) => annotations.push({
    type: 'warning',
    component: 'apiDescriptionParser',
    message: `${method} ${pathTemplate} ${where} uses the OpenAPI 3.2 streaming `
      + `media type "${mediaType}" (itemSchema or Server-Sent Events), which Dredd `
      + 'does not validate as a stream; its body schema is skipped.',
    location: null,
  });

  const requestContent = operation.requestBody
    && resolveRef(document, operation.requestBody).content;
  Object.keys(requestContent || {}).forEach((mediaType) => {
    if (isStreamingMediaType(mediaType, requestContent[mediaType])) {
      note(mediaType, 'request body');
    }
  });

  Object.keys(operation.responses || {}).forEach((status) => {
    const content = resolveRef(document, operation.responses[status]).content || {};
    Object.keys(content).forEach((mediaType) => {
      if (isStreamingMediaType(mediaType, content[mediaType])) {
        note(mediaType, `${status} response`);
      }
    });
  });

  return annotations;
}

function compileOperation(document, filename, pathTemplate, pathItem, method, operation) {
  const parameters = mergeParameters(document, pathItem.parameters, operation.parameters);

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

  const parameterAnnotations = [];
  const uri = compileParameters(document, pathTemplate, parameters, parameterAnnotations);
  // Matching the parser-backed path: an operation whose URI cannot be built
  // (a required parameter without a value) yields no transactions.
  if (parameterAnnotations.some((annotation) => annotation.type === 'error')) {
    return { transactions: [], annotations: parameterAnnotations };
  }
  const headerParameters = compileHeaderParameters(document, parameters);
  const cookieHeaders = compileCookieParameters(document, parameters);
  const requests = compileRequests(
    document, method, uri, operation, [...headerParameters, ...cookieHeaders]
  );

  const annotations = [];
  // Response keys '1XX'–'5XX' are status code ranges, not codes. Like the
  // 3.0 path, they are reported and produce no transaction.
  const statuses = Object.keys(operation.responses || {}).filter((status) => {
    if (/^[1-5]XX$/i.test(status)) {
      annotations.push({
        type: 'warning',
        component: 'apiDescriptionParser',
        message: `${method} ${pathTemplate}: response status code range '${status}' `
          + 'is unsupported; no transaction is compiled for it.',
        location: null,
      });
      return false;
    }
    return true;
  });
  const hasAcceptParameter = request => request.headers
    .some((header) => header.name.toLowerCase() === 'accept');

  // Cartesian product of request representations and response representations
  // (request-major), matching the parser-backed path. Each response content
  // type yields a transaction; a response without content yields one. Each
  // transaction asks for its response media type with an Accept header.
  const transactions = requests.reduce((collected, request) => {
    statuses.forEach((status) => {
      const response = resolveRef(document, operation.responses[status]);
      getAllContents(response.content).forEach((content) => {
        const compiledResponse = compileResponse(document, status, response, content);
        const origin = compileOrigin(filename, document, pathTemplate, method, compiledResponse);
        const transactionRequest = { ...request, headers: [...request.headers] };
        if (content && !hasAcceptParameter(request)) {
          transactionRequest.headers.unshift({ name: 'Accept', value: content.mediaType });
        }
        collected.push({
          request: transactionRequest,
          response: compiledResponse,
          name: compileTransactionName(origin),
          origin,
          isDefault: status === 'default',
        });
      });
    });
    return collected;
  }, []);

  return {
    transactions,
    annotations: parameterAnnotations
      .concat(annotations)
      .concat(collectStreamingAnnotations(document, method, pathTemplate, operation)),
  };
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

  const entries = transactions.map((transaction) => ({
    transaction, isDefault: transaction.isDefault,
  }));
  transactions.forEach((transaction) => {
    delete transaction.isDefault; // eslint-disable-line no-param-reassign
  });
  disambiguateNames(entries);

  return {
    mediaType: 'application/vnd.oai.openapi',
    transactions,
    annotations,
  };
};

// Exposed only for unit tests.
export { sampleFromSchema as _sampleFromSchema };
