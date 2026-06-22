// @ts-check
import http from 'http';
import https from 'https';
// http-proxy-agent/https-proxy-agent v9 are ESM-only ("type": "module"), but
// Dredd's build emits CommonJS. This works at runtime because Dredd requires
// Node >= 22, where `require()` of an ESM module is supported; TypeScript's
// node16 module mode doesn't model that, so it flags the import (TS1479).
// Suppress it here until the package goes ESM (see #29).
// @ts-ignore -- Node >=22 require(ESM); resolved as ESM by `module: node16`
import { HttpProxyAgent } from 'http-proxy-agent';
// @ts-ignore -- Node >=22 require(ESM); resolved as ESM by `module: node16`
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * @typedef {object} ResponseInfo
 * @property {number} [statusCode]
 * @property {import('http').IncomingHttpHeaders} headers
 */

/**
 * @typedef {(
 *   error: Error | null,
 *   response?: ResponseInfo,
 *   responseBody?: Buffer | string,
 * ) => void} RequestCallback
 */

/**
 * @typedef {object} HttpClientOptions
 * @property {string} [uri]
 * @property {string} [url]
 * @property {string} [method]
 * @property {import('http').OutgoingHttpHeaders} [headers]
 * @property {string | Buffer} [body]
 * @property {BufferEncoding | null} [encoding]
 * @property {number} [timeout]
 * @property {boolean} [proxy] Pass `false` to opt out of proxying
 * @property {NodeJS.ProcessEnv} [env]
 * @property {boolean} [rejectUnauthorized]
 * @property {boolean} [strictSSL]
 * Remaining TLS/auth keys (auth, ca, cert, ...) are forwarded dynamically.
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @returns {string | undefined}
 */
function getEnvVar(env, name) {
  const lower = env[name.toLowerCase()];
  return lower !== undefined && lower !== '' ? lower : env[name.toUpperCase()];
}

// Decides whether a given hostname (optionally with port) is excluded from
// proxying by the 'no_proxy' environment variable. Mirrors the behavior of
// the de-facto standard honored by the 'request' library and curl.
/**
 * @param {URL} url
 * @param {string | undefined} noProxy
 * @returns {boolean}
 */
function isProxyExcluded(url, noProxy) {
  if (!noProxy) {
    return false;
  }
  if (noProxy === '*') {
    return true;
  }
  const host = url.hostname;
  const hostWithPort = url.port ? `${host}:${url.port}` : host;
  return noProxy
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      const candidate = entry.replace(/^\./, '');
      return (
        candidate === host ||
        candidate === hostWithPort ||
        host.endsWith(`.${candidate}`)
      );
    });
}

// Returns the proxy URL that applies to the given target URL based on the
// 'http_proxy'/'https_proxy'/'no_proxy' environment variables, or null when
// no proxy should be used.
/**
 * @param {URL} url
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
function getProxyForUrl(url, env) {
  if (isProxyExcluded(url, getEnvVar(env, 'NO_PROXY'))) {
    return null;
  }
  const proxy =
    url.protocol === 'https:'
      ? getEnvVar(env, 'HTTPS_PROXY')
      : getEnvVar(env, 'HTTP_PROXY');
  return proxy || null;
}

/**
 * @param {URL} url
 * @param {string} proxy
 * @param {HttpClientOptions} options
 * @returns {import('http').Agent}
 */
function createProxyAgent(url, proxy, options) {
  /** @type {{ rejectUnauthorized?: boolean }} */
  const agentOptions = {};
  if (options.rejectUnauthorized !== undefined) {
    agentOptions.rejectUnauthorized = options.rejectUnauthorized;
  } else if (options.strictSSL === false) {
    agentOptions.rejectUnauthorized = false;
  }
  return url.protocol === 'https:'
    ? new HttpsProxyAgent(proxy, agentOptions)
    : new HttpProxyAgent(proxy, agentOptions);
}

/**
 * @returns {NodeJS.ErrnoException}
 */
function createTimeoutError() {
  /** @type {NodeJS.ErrnoException} */
  const error = new Error('ESOCKETTIMEDOUT');
  error.code = 'ESOCKETTIMEDOUT';
  return error;
}

/**
 * @param {string | Buffer | undefined | null} body
 * @returns {Buffer | null}
 */
function getRequestBody(body) {
  if (body === undefined || body === null) {
    return null;
  }
  return body instanceof Buffer ? body : Buffer.from(`${body}`);
}

/**
 * @param {Buffer} buffer
 * @param {BufferEncoding | null | undefined} encoding
 * @returns {Buffer | string}
 */
function getResponseBody(buffer, encoding) {
  if (encoding === null) {
    return buffer;
  }
  return buffer.toString(encoding || 'utf8');
}

/**
 * @param {HttpClientOptions} options
 * @param {URL} url
 * @returns {import('https').RequestOptions}
 */
function createRequestOptions(options, url) {
  /** @type {import('https').RequestOptions} */
  const requestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: `${url.pathname}${url.search}`,
    method: options.method || 'GET',
    headers: { ...(options.headers || {}) },
  };

  [
    'auth',
    'ca',
    'cert',
    'ciphers',
    'key',
    'localAddress',
    'passphrase',
    'pfx',
    'secureProtocol',
    'servername',
  ].forEach((key) => {
    // Forward a fixed set of TLS/auth pass-through options verbatim. The keys
    // are dynamic, so the two option bags are indexed as `any` here.
    const value = /** @type {any} */ (options)[key];
    if (value !== undefined) {
      /** @type {any} */ (requestOptions)[key] = value;
    }
  });

  if (options.rejectUnauthorized !== undefined) {
    requestOptions.rejectUnauthorized = options.rejectUnauthorized;
  } else if (options.strictSSL === false) {
    requestOptions.rejectUnauthorized = false;
  }

  // 'proxy: false' opts the request out of proxying (used for requests to the
  // server under test); otherwise proxy settings come from the environment.
  if (options.proxy !== false) {
    const proxy = getProxyForUrl(url, options.env || process.env);
    if (proxy) {
      requestOptions.agent = createProxyAgent(url, proxy, options);
    }
  }

  return requestOptions;
}

/**
 * @param {HttpClientOptions} options
 * @param {RequestCallback} callback
 */
export default function request(options, callback) {
  const uri = options.uri || options.url;
  const url = new URL(/** @type {string} */ (uri));
  const transport = url.protocol === 'https:' ? https : http;
  const requestBody = getRequestBody(options.body);
  let settled = false;

  /**
   * @param {Error | null} error
   * @param {ResponseInfo} [response]
   * @param {Buffer | string} [responseBody]
   */
  function finish(error, response, responseBody) {
    if (settled) {
      return;
    }
    settled = true;
    callback(error, response, responseBody);
  }

  const req = transport.request(
    createRequestOptions(options, url),
    (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      const responseInfo = {
        statusCode: response.statusCode,
        headers: response.headers,
      };

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', (error) => finish(error));
      response.on('end', () => {
        const responseBody = getResponseBody(
          Buffer.concat(chunks),
          options.encoding,
        );
        finish(null, responseInfo, responseBody);
      });
    },
  );

  req.on('error', (error) => finish(error));

  if (options.timeout) {
    req.setTimeout(options.timeout, () => {
      req.destroy(createTimeoutError());
    });
  }

  if (requestBody) {
    req.write(requestBody);
  }

  req.end();
}
