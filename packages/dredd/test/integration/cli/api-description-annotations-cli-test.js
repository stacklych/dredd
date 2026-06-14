import { assert } from 'chai';

import {
  runCLIWithServer,
  createServer,
  DEFAULT_SERVER_PORT,
} from '../helpers';

describe('CLI - API Description Document annotations', () => {
  describe('when loaded from file', () => {
    describe('when the API description is loaded with errors', () => {
      let runtimeInfo;
      const args = [
        './test/fixtures/error-openapi.yaml',
        `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
      ];

      before((done) => {
        const app = createServer();
        runCLIWithServer(args, app, (err, info) => {
          runtimeInfo = info;
          done(err);
        });
      });

      it('should exit with status 1', () =>
        assert.equal(runtimeInfo.dredd.exitStatus, 1));
      it('should print error message to stderr', () =>
        assert.include(
          runtimeInfo.dredd.stderr,
          'API description processing error',
        ));
    });

    describe('when the API description is loaded with warnings', () => {
      let runtimeInfo;
      const args = [
        './test/fixtures/warning-openapi.yaml',
        `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
        '--no-color',
      ];

      before((done) => {
        const app = createServer();
        app.get('/machines', (req, res) =>
          res.json([{ type: 'bulldozer', name: 'willy' }]),
        );
        runCLIWithServer(args, app, (err, info) => {
          runtimeInfo = info;
          done(err);
        });
      });

      it('should exit with status 0', () =>
        assert.equal(runtimeInfo.dredd.exitStatus, 0));
      it('should print warning to output', () =>
        assert.include(
          runtimeInfo.dredd.output,
          "in location 'header' should not be",
        ));
    });
  });
});
