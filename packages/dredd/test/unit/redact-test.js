import { assert } from 'chai';

import {
  REDACTED,
  isSensitiveHeader,
  redactHeaders,
  redactConfiguration,
} from '../../lib/redact';
import prettifyResponse from '../../lib/prettifyResponse';

describe('redact', () => {
  describe('isSensitiveHeader()', () => {
    [
      'Authorization',
      'proxy-authorization',
      'Cookie',
      'Set-Cookie',
      'X-API-Key',
      'X-Api_Key',
      'X-Auth-Token',
      'X-Session-Id',
      'X-Client-Secret',
    ].forEach((name) => {
      it(`treats ${name} as sensitive`, () =>
        assert.isTrue(isSensitiveHeader(name)));
    });

    ['Content-Type', 'Accept', 'X-Request-Id', 'Author'].forEach((name) => {
      it(`does not treat ${name} as sensitive`, () =>
        assert.isFalse(isSensitiveHeader(name)));
    });
  });

  it('redactHeaders() replaces only sensitive values and copies the object', () => {
    const headers = { Authorization: 'Basic Y2k6c2VjcmV0', Accept: '*/*' };
    assert.deepEqual(redactHeaders(headers), {
      Authorization: REDACTED,
      Accept: '*/*',
    });
    assert.equal(headers.Authorization, 'Basic Y2k6c2VjcmV0');
  });

  it('redactConfiguration() hides --user and sensitive --header values', () => {
    const redacted = redactConfiguration({
      user: 'ci:secret',
      header: [
        'Authorization: Basic Y2k6c2VjcmV0',
        'X-API-Key: abc',
        'Accept: application/json',
      ],
    });
    assert.equal(redacted.user, REDACTED);
    assert.deepEqual(redacted.header, [
      `Authorization: ${REDACTED}`,
      `X-API-Key: ${REDACTED}`,
      'Accept: application/json',
    ]);
  });

  it('prettifyResponse() does not print credentials', () => {
    const output = prettifyResponse({
      headers: { Authorization: 'Basic Y2k6c2VjcmV0', Accept: '*/*' },
    });
    assert.notInclude(output, 'Y2k6c2VjcmV0');
    assert.include(output, `Authorization: ${REDACTED}`);
    assert.include(output, 'Accept: */*');
  });
});
