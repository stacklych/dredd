import caseless from 'caseless';
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';

import defaultRequest from './httpClient';
import defaultLogger from './logger';

interface TransactionRequest {
  method?: string;
  body?: string | Buffer;
  bodyEncoding?: string;
  headers?: OutgoingHttpHeaders;
}

interface TransactionResponse {
  statusCode?: number;
  headers: IncomingHttpHeaders;
  bodyEncoding?: BufferEncoding;
  body?: string;
}

type PerformCallback = (
  error: Error | null,
  response?: TransactionResponse,
) => void;

interface PerformRequestOptions {
  logger?: typeof defaultLogger;
  request?: typeof defaultRequest;
  http?: Record<string, any>;
}

/**
 * Performs the HTTP request as described in the 'transaction.request' object
 *
 * In future we should introduce a 'real' request object as well so user has
 * access to the modifications made on the way.
 */
function performRequest(
  uri: string,
  transactionReq: TransactionRequest,
  options: PerformRequestOptions | PerformCallback,
  callback?: PerformCallback,
): void {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = callback as PerformCallback;
  const logger = options.logger || defaultLogger;
  const request = options.request || defaultRequest;

  const httpOptions: Parameters<typeof defaultRequest>[0] & {
    followRedirect?: boolean;
  } = { ...(options.http || {}) };
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
            responseBody as Buffer | undefined,
          ),
        );
      }
    });
  } catch (error) {
    process.nextTick(() => cb(error as Error));
  }
}

/**
 * Coerces the HTTP request body to a Buffer
 */
export function getBodyAsBuffer(
  body: string | Buffer | undefined,
  encoding: string | undefined,
): Buffer {
  return body instanceof Buffer
    ? body
    : Buffer.from(`${body || ''}`, normalizeBodyEncoding(encoding));
}

/**
 * Returns the encoding as either 'utf-8' or 'base64'. Throws
 * an error in case any other encoding is provided.
 */
export function normalizeBodyEncoding(
  encoding: string | undefined,
): 'utf-8' | 'base64' {
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
 * @param headers HTTP request headers
 * @param body HTTP request body
 */
export function normalizeContentLengthHeader(
  headers: OutgoingHttpHeaders | undefined,
  body: Buffer,
  options: { logger?: typeof defaultLogger } = {},
): OutgoingHttpHeaders {
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
 * @param response Node.js HTTP response
 * @param body HTTP response body as Buffer
 */
export function createTransactionResponse(
  response?: { statusCode?: number; headers?: IncomingHttpHeaders },
  body?: Buffer,
): TransactionResponse {
  const transactionRes: TransactionResponse = {
    statusCode: response && response.statusCode,
    headers: { ...(response && response.headers) },
  };
  if (body && Buffer.byteLength(body)) {
    transactionRes.bodyEncoding = detectBodyEncoding(body);
    transactionRes.body = body.toString(transactionRes.bodyEncoding);
  }
  return transactionRes;
}

export function detectBodyEncoding(body: Buffer): 'base64' | 'utf-8' {
  // U+FFFD is a replacement character in UTF-8 and indicates there
  // are some bytes which could not been translated as UTF-8. Therefore
  // let's assume the body is in binary format. Dredd encodes binary as
  // Base64 to be able to transfer it wrapped in JSON over the TCP to non-JS
  // hooks implementations.
  return body.toString().includes('\ufffd') ? 'base64' : 'utf-8';
}

export default performRequest;
