import { assert } from 'chai';

import { createServer, runCLI, DEFAULT_SERVER_PORT } from './helpers';

describe('Integration test helpers', () => {
  describe('createServer().listen() on a port that is in use', () => {
    let first;
    let error;

    before((done) => {
      first = createServer().listen(DEFAULT_SERVER_PORT, (err) => {
        if (err) {
          done(err);
          return;
        }
        createServer().listen(DEFAULT_SERVER_PORT, (secondErr) => {
          error = secondErr;
          done();
        });
      });
    });

    after((done) => first.close(() => done()));

    it('passes the listen error to the callback', () => {
      assert.instanceOf(error, Error);
      assert.equal(error.code, 'EADDRINUSE');
    });
  });

  describe("createServer({ protocol: 'https' }).listen() on a port that is in use", () => {
    let first;
    let error;

    before((done) => {
      first = createServer().listen(DEFAULT_SERVER_PORT, (err) => {
        if (err) {
          done(err);
          return;
        }
        createServer({ protocol: 'https' }).listen(
          DEFAULT_SERVER_PORT,
          (secondErr) => {
            error = secondErr;
            done();
          },
        );
      });
    });

    after((done) => first.close(() => done()));

    it('passes the listen error to the callback', () => {
      assert.instanceOf(error, Error);
      assert.equal(error.code, 'EADDRINUSE');
    });
  });

  describe('runCLI()', () => {
    let cliInfo;

    before((done) => {
      runCLI(['--version'], (err, info) => {
        cliInfo = info;
        done(err);
      });
    });

    it('collects the output and the exit status', () => {
      assert.equal(cliInfo.exitStatus, 0);
      assert.include(cliInfo.stdout, '@stacklych/dredd');
    });
  });
});
