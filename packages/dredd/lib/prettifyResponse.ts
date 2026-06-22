import html from 'html';

import logger from './logger';

/**
 * Render an HTTP response-like object (real response, expected response, or
 * schema-bearing object) as a human-readable string for the reporters. Field
 * values are arbitrary (bodies may be any content type), so they are typed
 * loosely.
 */
export default function prettifyResponse(
  response: Record<string, any> | null | undefined,
): string {
  let contentType: string | undefined;

  function stringify(obj: any): any {
    try {
      if (typeof obj === 'string') {
        obj = JSON.parse(obj);
      }
      obj = JSON.stringify(obj, null, 2);
    } catch (e) {
      logger.debug(`Could not stringify: ${obj}`);
    }
    return obj;
  }

  function prettifyBody(body: any, contentKind: string | undefined): any {
    switch (contentKind) {
      case 'text/html':
        body = html.prettyPrint(body, { indent_size: 2 });
        break;
      default:
        body = stringify(body);
    }
    return body;
  }

  if (response && response.headers) {
    contentType =
      response.headers['content-type'] || response.headers['Content-Type'];
  }

  const safeResponse: Record<string, any> = response || {};
  let stringRepresentation = '';
  for (const key of Object.keys(safeResponse)) {
    let value = safeResponse[key];
    if (key === 'body') {
      value = `\n${prettifyBody(value, contentType)}`;
    } else if (key === 'schema') {
      value = `\n${stringify(value)}`;
    } else if (key === 'headers') {
      let header = '\n';
      for (const hkey of Object.keys(value || {})) {
        const hval = value[hkey];
        header += `    ${hkey}: ${hval}\n`;
      }
      value = header;
    }

    stringRepresentation += `${key}: ${value}\n`;
  }

  return stringRepresentation;
}
