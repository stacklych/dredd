import fury from '@apielements/core';
import yaml from 'yaml-js';
import openapi3Parser from '@apielements/openapi3-parser';

fury.use(openapi3Parser);

const { Annotation, SourceMap, ParseResult } = fury.minim.elements;

function createAnnotation(type, message) {
  const element = new Annotation(message);
  element.classes.push(type);
  element.attributes.set('sourceMap', [
    new SourceMap([[0, 1]]),
  ]);
  return element;
}

function parse(apiDescription, callback) {
  let document;
  try {
    document = yaml.load(apiDescription);
  } catch (e) {
    // Let the OpenAPI 3 parser produce the public parse annotations.
    document = undefined;
  }

  const version = document && document.openapi;
  if (typeof version === 'string' && /^3\.1\.\d+$/.test(version)) {
    const apiElements = new ParseResult([]);
    apiElements.openapi31 = { document, source: apiDescription };
    callback(null, {
      mediaType: 'application/vnd.oai.openapi',
      apiElements,
    });
    return;
  }

  const adapters = fury.detect(apiDescription);
  if (!adapters.length) {
    const apiElements = new ParseResult([]);
    apiElements.push(createAnnotation(
      'error', (
        'Unrecognized API description format. '
        + 'Only OpenAPI 3.0 and 3.1 descriptions are supported.'
      )
    ));
    callback(null, {
      mediaType: 'application/vnd.oai.openapi',
      apiElements,
    });
    return;
  }

  const mediaType = adapters[0].mediaTypes[0];

  fury.parse({
    source: apiDescription,
    mediaType,
    generateSourceMap: true,
  }, (err, parseResult) => {
    const apiElements = parseResult || new ParseResult([]);

    if (err && !parseResult) {
      // The condition should be only 'if (err)'
      // https://github.com/apiaryio/api-elements.js/issues/167
      apiElements.unshift(createAnnotation(
        'error', (
          `Could not parse API description: ${err.message}`
        )
      ));
    }

    // The API Elements adapter does not expose OpenAPI 3.0 response body
    // schemas to the compiler. Keep the source document around so the compiler
    // can attach them for data-type validation.
    if (typeof version === 'string' && /^3\.0\.\d+$/.test(version)) {
      apiElements.openapi3Document = { document, source: apiDescription };
    }

    callback(null, { mediaType, apiElements });
  });
}

export default parse;
