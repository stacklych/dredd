import fs from 'fs';
import type { IncomingHttpHeaders } from 'http';

import defaultRequest from './httpClient';
import isURL from './isURL';

type ReadCallback = (error: Error | null, data?: string | Buffer) => void;

interface ReadLocationOptions {
  request?: typeof defaultRequest;
  http?: Record<string, any>;
}

function getErrorFromResponse(
  response: { statusCode?: number; headers: IncomingHttpHeaders },
  hasBody: boolean,
): Error {
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

function readRemoteFile(
  uri: string,
  options: ReadLocationOptions | ReadCallback,
  callback?: ReadCallback,
): void {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = callback as ReadCallback;
  const request = options.request || defaultRequest;

  const httpOptions: Parameters<typeof defaultRequest>[0] = {
    ...(options.http || {}),
  };
  httpOptions.uri = uri;
  httpOptions.timeout = 5000; // ms, limits both connection time and server response time

  try {
    request(httpOptions, (error, response, responseBody) => {
      if (error) {
        cb(error);
      } else if (!response) {
        cb(new Error('Unexpected error'));
      } else {
        const statusCode = response.statusCode as number;
        if (!responseBody || statusCode < 200 || statusCode >= 300) {
          cb(getErrorFromResponse(response, !!responseBody));
        } else {
          cb(null, responseBody);
        }
      }
    });
  } catch (error) {
    process.nextTick(() => cb(error as Error));
  }
}

function readLocalFile(path: string, callback: ReadCallback): void {
  fs.readFile(path, 'utf8', (error, data) => {
    if (error) {
      callback(error);
      return;
    }
    callback(null, data);
  });
}

export default function readLocation(
  location: string,
  options: ReadLocationOptions | ReadCallback,
  callback?: ReadCallback,
): void {
  if (typeof options === 'function') {
    [options, callback] = [{}, options];
  }
  const cb = callback as ReadCallback;
  if (isURL(location)) {
    readRemoteFile(location, options, cb);
  } else {
    readLocalFile(location, cb);
  }
}
