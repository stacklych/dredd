import { assert } from 'chai';

import Dredd from '../../lib/Dredd';
import { runDreddWithServer, createServer } from './helpers';

const FIXTURE_PATH = './test/fixtures/openapi30-json-schema.yml';
const VALID_BODY = {
  title: 'Not Found',
  status: 404,
  detail: null,
};

describe('OpenAPI 3.0 JSON Schema validation', () => {
  describe('when the server response matches the schema', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(VALID_BODY)),
      );
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as valid', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, passes: 1 }));
  });

  describe('when the server response has a wrong data type', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ ...VALID_BODY, status: '404' })),
      );
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as invalid', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, failures: 1 }));

    it('prints the data-type validation error', () =>
      assert.include(
        runtimeInfo.dredd.logging,
        "At '/status' Invalid type: string (expected integer)",
      ));
  });

  describe('when a nullable property is null', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ ...VALID_BODY, detail: null })),
      );
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('accepts null for a nullable property', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, passes: 1 }));
  });
});
