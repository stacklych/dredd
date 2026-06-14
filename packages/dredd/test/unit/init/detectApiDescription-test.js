import { assert } from 'chai';

import { detectApiDescription } from '../../../lib/init';

describe('init._detectApiDescription()', () => {
  it('defaults to apiary.yaml on empty array', () =>
    assert.equal(detectApiDescription([]), 'apiary.yaml'));

  it('defaults to apiary.yaml on arbitrary files', () =>
    assert.equal(detectApiDescription(['foo', 'bar']), 'apiary.yaml'));

  it("detects the first .yml file containing 'api' as OpenAPI 3", () =>
    assert.equal(
      detectApiDescription(['foo', 'openapi.yml', 'bar']),
      'openapi.yml',
    ));

  it("detects the first .yaml file containing 'api' as OpenAPI 3", () =>
    assert.equal(
      detectApiDescription(['foo', 'openapi.yaml', 'bar']),
      'openapi.yaml',
    ));
});
