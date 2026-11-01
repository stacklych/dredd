import esmock from 'esmock';
import { assert } from 'chai';

describe('Dredd compile errors', () => {
  let error;

  before(async () => {
    const Dredd = (
      await esmock('../../lib/Dredd.ts', {
        '@stacklych/dredd-transactions/compile': {
          default: () => {
            throw new Error('Something broke');
          },
        },
      })
    ).default;

    const dredd = new Dredd({
      apiDescriptions: [
        {
          location: 'api.yaml',
          content:
            'openapi: 3.1.0\ninfo: {title: T, version: "1"}\npaths: {}\n',
        },
      ],
      'dry-run': true,
    });
    await new Promise((resolve) => {
      dredd.run((err) => {
        error = err;
        resolve();
      });
    });
  });

  it('states the underlying message once', () => {
    assert.equal(
      error.message,
      "Unable to compile HTTP transactions from API description document 'configuration.apiDescriptions[0]': Something broke",
    );
  });
});
