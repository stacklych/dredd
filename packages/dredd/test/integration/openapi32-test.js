import { assert } from 'chai';

import Dredd from '../../lib/Dredd';
import { runDreddWithServer, createServer } from './helpers';

// End-to-end coverage for OpenAPI 3.2 features compiled by
// dredd-transactions: the QUERY method with a request body, an
// `additionalOperations` method, and an `in: querystring` parameter.
describe('OpenAPI 3.2 end to end', () => {
  let runtimeInfo;

  before((done) => {
    const app = createServer();
    app.all('/items', (req, res) => {
      if (req.method === 'QUERY') {
        // Node's setHeader, unlike Express's res.json(), adds no charset.
        res.setHeader('Content-Type', 'application/json');
        res.status(200).end(JSON.stringify([{ name: 'apple' }]));
      } else if (req.method === 'LOCK') {
        res.status(204).end();
      } else {
        res.status(405).end();
      }
    });
    app.get('/search', (req, res) => res.status(204).end());

    const dredd = new Dredd({
      options: { path: './test/fixtures/openapi32.yaml' },
    });
    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('passes every transaction', () =>
    assert.deepInclude(runtimeInfo.dredd.stats, {
      tests: 3,
      passes: 3,
      failures: 0,
      errors: 0,
    }));

  it('sends QUERY with the request body', () => {
    const query = runtimeInfo.server.requests['/items'].find(
      (request) => request.method === 'QUERY',
    );
    assert.deepEqual(query.body, { color: 'red' });
    assert.equal(query.headers['content-type'], 'application/json');
  });

  it('sends the additionalOperations method as declared', () => {
    const methods = runtimeInfo.server.requests['/items'].map(
      (request) => request.method,
    );
    assert.include(methods, 'LOCK');
  });

  it('sends the querystring parameter value verbatim', () =>
    assert.property(runtimeInfo.server.requests, '/search?color=red&size=L'));
});
