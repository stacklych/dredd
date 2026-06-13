import { assert } from 'chai';

import Dredd from '../../lib/Dredd';
import { runDreddWithServer, createServer } from './helpers';

const FIXTURE_PATH = './test/fixtures/openapi31-json-schema.yml';
const VALID_PROBLEM_BODY = {
  type: 'https://problems.saas-coaching.com/not_found',
  title: 'Not Found',
  status: 404,
  detail: 'Resource was not found.',
  instance: '/resource',
  error_code: 'not_found',
  trace_id: '018eac70-76b2-7dad-9cd8-3c0f1f5cb200',
};

describe('OpenAPI 3.1 JSON Schema validation', () => {
  describe('when the server response matches a JSON Schema 2020-12 schema', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(VALID_PROBLEM_BODY)));
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as valid', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, passes: 1 }));
  });

  describe('when the server response does not match a JSON Schema 2020-12 schema', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(Object.assign({}, VALID_PROBLEM_BODY, {
            status: '404',
          }))));
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as invalid', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, failures: 1 }));

    it('prints JSON Schema 2020-12 validation error', () =>
      assert.include(
        runtimeInfo.dredd.logging,
        "At '/status' Invalid type: string (expected integer)",
      ));
  });

  describe('when the server response does not match OpenAPI formats', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify(Object.assign({}, VALID_PROBLEM_BODY, {
            trace_id: 'not-a-uuid',
          }))));
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as invalid', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, { tests: 1, failures: 1 }));

    it('prints OpenAPI format validation error', () =>
      assert.include(
        runtimeInfo.dredd.logging,
        'At \'/trace_id\' must match format "uuid"',
      ));
  });

  describe('when the server response body is not JSON', () => {
    let runtimeInfo;

    before((done) => {
      const app = createServer();
      app.get('/resource', (req, res) =>
        res
          .status(404)
          .set('Content-Type', 'application/json')
          .send('not-json'));
      const dredd = new Dredd({ options: { path: FIXTURE_PATH } });

      runDreddWithServer(dredd, app, (error, info) => {
        runtimeInfo = info;
        done(error);
      });
    });

    it('evaluates the response as invalid instead of errored', () =>
      assert.deepInclude(runtimeInfo.dredd.stats, {
        tests: 1,
        failures: 1,
        errors: 0,
      }));

    it('prints invalid JSON as a validation failure', () =>
      assert.include(
        runtimeInfo.dredd.logging,
        'Expected data to be a valid JSON',
      ));
  });
});
