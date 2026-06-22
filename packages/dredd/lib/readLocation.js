// @ts-check
import fs from 'fs';

import defaultRequest from './httpClient';
import isURL from './isURL';

/**
 * @typedef {(error: Error | null, data?: string | Buffer) => void} ReadCallback
 * @typedef {{
 *   request?: typeof defaultRequest,
 *   http?: Record<string, any>,
 * }} ReadLocationOptions
 */

/**
 * @param {{ statusCode?: number, headers: import('http').IncomingHttpHeaders }} response
 * @param {boolean} hasBody
 * @returns {Error}
 */
function getErrorFromResponse(response, hasBody) {
  const contentType = response.headers['content-type'];
  if (hasBody) {
    const bodyDescription = contentType
      ? `'${contentType}' body`
      : 'body without Content-Type';
    return new Error(
      `Dredd got HTTP ${response.statusCode} response with ${bodyDescription}`,
    );
  }
  return new Error(
    `Dredd got HTTP ${response.statusCode} response without body`,
  );
}

/**
 * @param {string} uri
 * @param {ReadLocationOptions | ReadCallback} options
 * @param {ReadCallback} [callback]
 */
function readRemoteFile(uri, options, callback) {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = /** @type {ReadCallback} */ (callback);
  const request = options.request || defaultRequest;

  /** @type {Parameters<typeof defaultRequest>[0]} */
  const httpOptions = { ...(options.http || {}) };
  httpOptions.uri = uri;
  httpOptions.timeout = 5000; // ms, limits both connection time and server response time

  try {
    request(httpOptions, (error, response, responseBody) => {
      if (error) {
        cb(error);
      } else if (!response) {
        cb(new Error('Unexpected error'));
      } else {
        const statusCode = /** @type {number} */ (response.statusCode);
        if (!responseBody || statusCode < 200 || statusCode >= 300) {
          cb(getErrorFromResponse(response, !!responseBody));
        } else {
          cb(null, responseBody);
        }
      }
    });
  } catch (error) {
    process.nextTick(() => cb(/** @type {Error} */ (error)));
  }
}

/**
 * @param {string} path
 * @param {ReadCallback} callback
 */
function readLocalFile(path, callback) {
  fs.readFile(path, 'utf8', (error, data) => {
    if (error) {
      callback(error);
      return;
    }
    callback(null, data);
  });
}

/**
 * @param {string} location
 * @param {ReadLocationOptions | ReadCallback} options
 * @param {ReadCallback} [callback]
 */
export default function readLocation(location, options, callback) {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = /** @type {ReadCallback} */ (callback);
  if (isURL(location)) {
    readRemoteFile(location, options, cb);
  } else {
    readLocalFile(location, cb);
  }
}
