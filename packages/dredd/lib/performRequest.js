// @ts-check
import caseless from 'caseless';

import defaultRequest from './httpClient';
import defaultLogger from './logger';

/**
 * @typedef {{
 *   method?: string,
 *   body?: string | Buffer,
 *   bodyEncoding?: string,
 *   headers?: import('http').OutgoingHttpHeaders,
 * }} TransactionRequest
 *
 * @typedef {{
 *   statusCode?: number,
 *   headers: import('http').IncomingHttpHeaders,
 *   bodyEncoding?: BufferEncoding,
 *   body?: string,
 * }} TransactionResponse
 *
 * @typedef {(error: Error | null, response?: TransactionResponse) => void} PerformCallback
 *
 * @typedef {{
 *   logger?: typeof defaultLogger,
 *   request?: typeof defaultRequest,
 *   http?: Record<string, any>,
 * }} PerformRequestOptions
 */

/**
 * Performs the HTTP request as described in the 'transaction.request' object
 *
 * In future we should introduce a 'real' request object as well so user has
 * access to the modifications made on the way.
 *
 * @param {string} uri
 * @param {TransactionRequest} transactionReq
 * @param {PerformRequestOptions | PerformCallback} options
 * @param {PerformCallback} [callback]
 */
function performRequest(uri, transactionReq, options, callback) {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = /** @type {PerformCallback} */ (callback);
  const logger = options.logger || defaultLogger;
  const request = options.request || defaultRequest;

  /** @type {Parameters<typeof defaultRequest>[0] & { followRedirect?: boolean }} */
  const httpOptions = { ...(options.http || {}) };
  httpOptions.proxy = false;
  httpOptions.followRedirect = false;
  httpOptions.encoding = null;
  httpOptions.method = transactionReq.method;
  httpOptions.uri = uri;

  try {
    httpOptions.body = getBodyAsBuffer(
      transactionReq.body,
      transactionReq.bodyEncoding,
    );
    httpOptions.headers = normalizeContentLengthHeader(
      transactionReq.headers,
      httpOptions.body,
    );

    const protocol = uri.split(':')[0].toUpperCase();
    logger.debug(
      `Performing ${protocol} request to the server under test: ` +
        `${httpOptions.method} ${httpOptions.uri}`,
    );

    request(httpOptions, (error, response, responseBody) => {
      logger.debug(`Handling ${protocol} response from the server under test`);
      if (error) {
        cb(error);
      } else {
        // encoding is null above, so httpClient yields a Buffer body.
        cb(
          null,
          createTransactionResponse(
            response,
            /** @type {Buffer | undefined} */ (responseBody),
          ),
        );
      }
    });
  } catch (error) {
    process.nextTick(() => cb(/** @type {Error} */ (error)));
  }
}

/**
 * Coerces the HTTP request body to a Buffer
 *
 * @param {string | Buffer | undefined} body
 * @param {string | undefined} encoding
 * @returns {Buffer}
 */
export function getBodyAsBuffer(body, encoding) {
  return body instanceof Buffer
    ? body
    : Buffer.from(`${body || ''}`, normalizeBodyEncoding(encoding));
}

/**
 * Returns the encoding as either 'utf-8' or 'base64'. Throws
 * an error in case any other encoding is provided.
 *
 * @param {string | undefined} encoding
 * @returns {'utf-8' | 'base64'}
 */
export function normalizeBodyEncoding(encoding) {
  if (!encoding) {
    return 'utf-8';
  }

  switch (encoding.toLowerCase()) {
    case 'utf-8':
    case 'utf8':
      return 'utf-8';
    case 'base64':
      return 'base64';
    default:
      throw new Error(
        `Unsupported encoding: '${encoding}' (only UTF-8 and ` +
          'Base64 are supported)',
      );
  }
}

/**
 * Detects an existing Content-Length header and overrides the user-provided
 * header value in case it's out of sync with the real length of the body.
 *
 * @param {import('http').OutgoingHttpHeaders | undefined} headers HTTP request headers
 * @param {Buffer} body HTTP request body
 * @param {{ logger?: typeof defaultLogger }} [options]
 * @returns {import('http').OutgoingHttpHeaders}
 */
export function normalizeContentLengthHeader(headers, body, options = {}) {
  const logger = options.logger || defaultLogger;

  const modifiedHeaders = { ...headers };
  const calculatedValue = Buffer.byteLength(body);
  const name = caseless(modifiedHeaders).has('Content-Length');
  if (name) {
    const value = parseInt(`${modifiedHeaders[name]}`, 10);
    if (value !== calculatedValue) {
      modifiedHeaders[name] = `${calculatedValue}`;
      logger.warn(
        `Specified Content-Length header is ${value}, but the real ` +
          `body length is ${calculatedValue}. Using ${calculatedValue} instead.`,
      );
    }
  } else {
    modifiedHeaders['Content-Length'] = `${calculatedValue}`;
  }
  return modifiedHeaders;
}

/**
 * Real transaction response object factory. Serializes binary responses
 * to string using Base64 encoding.
 *
 * @param {{ statusCode?: number, headers?: import('http').IncomingHttpHeaders }} [response]
 *   Node.js HTTP response
 * @param {Buffer} [body] HTTP response body as Buffer
 * @returns {TransactionResponse}
 */
export function createTransactionResponse(response, body) {
  /** @type {TransactionResponse} */
  const transactionRes = {
    statusCode: response && response.statusCode,
    headers: { ...(response && response.headers) },
  };
  if (body && Buffer.byteLength(body)) {
    transactionRes.bodyEncoding = detectBodyEncoding(body);
    transactionRes.body = body.toString(transactionRes.bodyEncoding);
  }
  return transactionRes;
}

/**
 * @param {Buffer} body
 * @returns {'base64' | 'utf-8'}
 */
export function detectBodyEncoding(body) {
  // U+FFFD is a replacement character in UTF-8 and indicates there
  // are some bytes which could not been translated as UTF-8. Therefore
  // let's assume the body is in binary format. Dredd encodes binary as
  // Base64 to be able to transfer it wrapped in JSON over the TCP to non-JS
  // hooks implementations.
  return body.toString().includes('\ufffd') ? 'base64' : 'utf-8';
}

export default performRequest;
