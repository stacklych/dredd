import http from 'http';
import https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

function getEnvVar(env, name) {
  const lower = env[name.toLowerCase()];
  return lower !== undefined && lower !== '' ? lower : env[name.toUpperCase()];
}

// Decides whether a given hostname (optionally with port) is excluded from
// proxying by the 'no_proxy' environment variable. Mirrors the behavior of
// the de-facto standard honored by the 'request' library and curl.
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

function createProxyAgent(url, proxy, options) {
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

function createTimeoutError() {
  const error = new Error('ESOCKETTIMEDOUT');
  error.code = 'ESOCKETTIMEDOUT';
  return error;
}

function getRequestBody(body) {
  if (body === undefined || body === null) {
    return null;
  }
  return body instanceof Buffer ? body : Buffer.from(`${body}`);
}

function getResponseBody(buffer, encoding) {
  if (encoding === null) {
    return buffer;
  }
  return buffer.toString(encoding || 'utf8');
}

function createRequestOptions(options, url) {
  const requestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: `${url.pathname}${url.search}`,
    method: options.method || 'GET',
    headers: Object.assign({}, options.headers || {}),
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
    if (options[key] !== undefined) {
      requestOptions[key] = options[key];
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

export default function request(options, callback) {
  const uri = options.uri || options.url;
  const url = new URL(uri);
  const transport = url.protocol === 'https:' ? https : http;
  const requestBody = getRequestBody(options.body);
  let settled = false;

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
      const chunks = [];
      const responseInfo = {
        statusCode: response.statusCode,
        headers: response.headers,
      };

      response.on('data', chunk => chunks.push(chunk));
      response.on('error', error => finish(error));
      response.on('end', () => {
        const responseBody = getResponseBody(
          Buffer.concat(chunks),
          options.encoding,
        );
        finish(null, responseInfo, responseBody);
      });
    },
  );

  req.on('error', error => finish(error));

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
