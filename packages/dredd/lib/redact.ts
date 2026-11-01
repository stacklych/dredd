// Redaction of credentials in Dredd's own output (CLI and file reporters,
// debug logs). Only what Dredd prints is redacted; the requests Dredd sends
// keep the real values.

export const REDACTED = '[REDACTED]';

const SENSITIVE_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
];

// Header names that usually carry a credential, e.g. X-API-Key,
// X-Auth-Token, X-Session-Id. Matches whole words of the name.
const SENSITIVE_HEADER_PATTERN =
  /(^|[-_])(auth|token|secret|api[-_]?key|password|passwd|session)([-_]|$)/i;

export function isSensitiveHeader(name: string): boolean {
  const lowerCased = String(name).toLowerCase();
  return (
    SENSITIVE_HEADERS.includes(lowerCased) ||
    SENSITIVE_HEADER_PATTERN.test(lowerCased)
  );
}

// Returns a copy of a `{ name: value }` headers object with the values of
// sensitive headers replaced.
export function redactHeaders(
  headers: Record<string, any> | null | undefined,
): Record<string, any> | null | undefined {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }
  return Object.keys(headers).reduce(
    (result, name) => {
      result[name] = isSensitiveHeader(name) ? REDACTED : headers[name];
      return result;
    },
    {} as Record<string, any>,
  );
}

// Returns a copy of a request/response-like object (`{ headers, ... }`) with
// sensitive header values replaced.
export function redactMessage<T extends Record<string, any> | null | undefined>(
  message: T,
): T {
  if (!message || typeof message !== 'object' || !message.headers) {
    return message;
  }
  return { ...message, headers: redactHeaders(message.headers) };
}

// Returns a copy of a Dredd configuration with credentials replaced: `user`
// and sensitive entries of `header` ('Name: value' strings).
export function redactConfiguration(
  configuration: Record<string, any>,
): Record<string, any> {
  const redacted: Record<string, any> = { ...configuration };
  if (redacted.user) {
    redacted.user = REDACTED;
  }
  if (Array.isArray(redacted.header)) {
    redacted.header = redacted.header.map((header: any) => {
      if (typeof header !== 'string') {
        return header;
      }
      const separator = header.indexOf(':');
      if (separator === -1) {
        return header;
      }
      const name = header.slice(0, separator);
      return isSensitiveHeader(name.trim()) ? `${name}: ${REDACTED}` : header;
    });
  }
  return redacted;
}
