import http from 'http';
import https from 'https';
import type { Agent, IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import type { RequestOptions } from 'https';
// http-proxy-agent/https-proxy-agent v9 are ESM-only ("type": "module"), but
// Dredd's build emits CommonJS. This works at runtime because Dredd requires
// Node >= 22, where `require()` of an ESM module is supported; TypeScript's
// node16 module mode doesn't model that, so it flags the import (TS1479).
// Suppress it here until the package goes ESM (see #29).
// @ts-expect-error -- Node >=22 require(ESM); resolved as ESM by `module: node16`
import { HttpProxyAgent } from 'http-proxy-agent';
// @ts-expect-error -- Node >=22 require(ESM); resolved as ESM by `module: node16`
import { HttpsProxyAgent } from 'https-proxy-agent';

interface ResponseInfo {
  statusCode?: number;
  headers: IncomingHttpHeaders;
}

type RequestCallback = (
  error: Error | null,
  response?: ResponseInfo,
  responseBody?: Buffer | string,
) => void;

interface HttpClientOptions {
  uri?: string;
  url?: string;
  method?: string;
  headers?: OutgoingHttpHeaders;
  body?: string | Buffer;
  encoding?: BufferEncoding | null;
  timeout?: number;
  /** Pass `false` to opt out of proxying */
  proxy?: boolean;
  env?: NodeJS.ProcessEnv;
  rejectUnauthorized?: boolean;
  strictSSL?: boolean;
  // Remaining TLS/auth keys (auth, ca, cert, ...) are forwarded dynamically.
}

function getEnvVar(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const lower = env[name.toLowerCase()];
  return lower !== undefined && lower !== '' ? lower : env[name.toUpperCase()];
}

// Decides whether a given hostname (optionally with port) is excluded from
// proxying by the 'no_proxy' environment variable. Mirrors the behavior of
// the de-facto standard honored by the 'request' library and curl.
function isProxyExcluded(url: URL, noProxy: string | undefined): boolean {
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
function getProxyForUrl(url: URL, env: NodeJS.ProcessEnv): string | null {
  if (isProxyExcluded(url, getEnvVar(env, 'NO_PROXY'))) {
    return null;
  }
  const proxy =
    url.protocol === 'https:'
      ? getEnvVar(env, 'HTTPS_PROXY')
      : getEnvVar(env, 'HTTP_PROXY');
  return proxy || null;
}

function createProxyAgent(
  url: URL,
  proxy: string,
  options: HttpClientOptions,
): Agent {
  const agentOptions: { rejectUnauthorized?: boolean } = {};
  if (options.rejectUnauthorized !== undefined) {
    agentOptions.rejectUnauthorized = options.rejectUnauthorized;
  } else if (options.strictSSL === false) {
    agentOptions.rejectUnauthorized = false;
  }
  return url.protocol === 'https:'
    ? new HttpsProxyAgent(proxy, agentOptions)
    : new HttpProxyAgent(proxy, agentOptions);
}

function createTimeoutError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error('ESOCKETTIMEDOUT');
  error.code = 'ESOCKETTIMEDOUT';
  return error;
}

function getRequestBody(
  body: string | Buffer | undefined | null,
): Buffer | null {
  if (body === undefined || body === null) {
    return null;
  }
  return body instanceof Buffer ? body : Buffer.from(`${body}`);
}

function getResponseBody(
  buffer: Buffer,
  encoding: BufferEncoding | null | undefined,
): Buffer | string {
  if (encoding === null) {
    return buffer;
  }
  return buffer.toString(encoding || 'utf8');
}

function createRequestOptions(
  options: HttpClientOptions,
  url: URL,
): RequestOptions {
  const requestOptions: RequestOptions = {
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
    const value = (options as any)[key];
    if (value !== undefined) {
      (requestOptions as any)[key] = value;
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

export default function request(
  options: HttpClientOptions,
  callback: RequestCallback,
): void {
  const uri = options.uri || options.url;
  const url = new URL(uri as string);
  const transport = url.protocol === 'https:' ? https : http;
  const requestBody = getRequestBody(options.body);
  let settled = false;

  function finish(
    error: Error | null,
    response?: ResponseInfo,
    responseBody?: Buffer | string,
  ): void {
    if (settled) {
      return;
    }
    settled = true;
    callback(error, response, responseBody);
  }

  const req = transport.request(
    createRequestOptions(options, url),
    (response) => {
      const chunks: Buffer[] = [];
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
