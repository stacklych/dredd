import { assert } from 'chai';

import { createRequestOptions } from '../../lib/httpClient';

describe('httpClient createRequestOptions()', () => {
  it('passes an IPv6 literal host without brackets', () => {
    const options = createRequestOptions(
      { method: 'GET' },
      new URL('http://[::1]:3000/items?x=1'),
    );
    assert.equal(options.hostname, '::1');
    assert.equal(options.port, '3000');
    assert.equal(options.path, '/items?x=1');
  });

  it('passes a host name or IPv4 address unchanged', () => {
    assert.equal(
      createRequestOptions({}, new URL('http://127.0.0.1:3000/')).hostname,
      '127.0.0.1',
    );
    assert.equal(
      createRequestOptions({}, new URL('https://api.example.com/')).hostname,
      'api.example.com',
    );
  });
});
