const PROXY_ENV_VARIABLES = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'];

/**
 * Expects an environment variables object (typically process.env)
 * and returns an array of strings representing HTTP proxy settings,
 * such as ['HTTPS_PROXY=https://proxy.example.com:8080', ...]
 *
 * Supports both upper and lower case names and skips env vars set as empty
 * strings (other falsy values are not taken care of as env vars can only
 * be strings).
 *
 * Note: Dredd prints these settings for diagnostics. The settings are applied
 * by ./httpClient.js for requests to remote API descriptions and the Apiary
 * API. Requests to the server under test deliberately opt out of proxying
 * (see performRequest.js, which sets 'proxy: false').
 */
export default function getProxySettings(env) {
  return Object.entries(env)
    .filter((entry) => PROXY_ENV_VARIABLES.includes(entry[0].toUpperCase()))
    .filter((entry) => entry[1] !== '')
    .map((entry) => `${entry[0]}=${entry[1]}`);
}
