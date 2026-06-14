import sinon from 'sinon';
import { assert } from 'chai';

import Dredd from '../../lib/Dredd';

function compileTransactions(apiDescription, logger, callback) {
  const dredd = new Dredd({ apiDescriptions: [apiDescription] });
  dredd.logger = logger;
  dredd.transactionRunner.run = sinon.stub().callsArg(1);
  dredd.run(callback);
}

describe('Parser and compiler annotations', () => {
  describe('when processing a file with parser warnings', () => {
    const logger = { debug: sinon.spy(), log: sinon.spy() };
    let error;

    before((done) => {
      compileTransactions(
        `openapi: "3.0.0"
info:
  title: Dummy API
  version: "1"
paths:
  /:
    get:
      parameters:
        - name: Authorization
          in: header
          schema:
            type: string
      responses:
        "200":
          description: OK
`,
        logger,
        (compileError) => {
          error = compileError;
          done();
        },
      );
    });

    it("doesn't abort Dredd", () => {
      assert.isUndefined(error);
    });
    it('logs warnings', () => {
      assert.equal(logger.log.getCall(0).args[0], 'warn');
    });
    it('logs the parser warning', () => {
      assert.match(
        logger.log.getCall(0).args[1],
        /API description parser warning in configuration\.apiDescriptions\[0\].*should not be 'Accept', 'Content-Type' or 'Authorization'/i,
      );
    });
  });

  describe('when processing a file with parser errors', () => {
    const logger = { debug: sinon.spy(), log: sinon.spy() };
    let error;

    before((done) => {
      compileTransactions(
        `openapi: "3.0.0"
info:
  title: Dummy API
paths:
  /:
    get:
      responses:
        "200":
          description: OK
`,
        logger,
        (compileError) => {
          error = compileError;
          done();
        },
      );
    });

    it('aborts Dredd', () => {
      assert.instanceOf(error, Error);
    });
    it('logs errors', () => {
      assert.equal(logger.log.getCall(0).args[0], 'error');
    });
    it('logs the parser error', () => {
      assert.match(
        logger.log.getCall(0).args[1],
        /API description parser error in configuration\.apiDescriptions\[0\].*missing required property 'version'/i,
      );
    });
  });

  describe('when processing a file with compilation warnings', () => {
    const logger = { debug: sinon.spy(), log: sinon.spy() };
    let error;

    before((done) => {
      compileTransactions(
        `openapi: "3.0.0"
info:
  title: Dummy API
  version: "1"
paths:
  /{foo}:
    get:
      responses:
        "200":
          description: OK
`,
        logger,
        (compileError) => {
          error = compileError;
          done();
        },
      );
    });

    it("doesn't abort Dredd", () => {
      assert.isUndefined(error);
    });
    it('logs warnings', () => {
      assert.equal(logger.log.getCall(0).args[0], 'warn');
    });
    it('logs the URI template expansion warning', () => {
      assert.match(
        logger.log.getCall(0).args[1],
        /API description URI template expansion warning in configuration\.apiDescriptions\[0\].*Ambiguous URI parameter in template: \/\{foo\}/i,
      );
    });
  });

  describe('when processing a file with compilation errors', () => {
    const logger = { debug: sinon.spy(), log: sinon.spy() };
    let error;

    before((done) => {
      compileTransactions(
        `openapi: "3.0.0"
info:
  title: Dummy API
  version: "1"
paths:
  /:
    delete:
      parameters:
        - name: param
          in: query
          required: true
          schema:
            type: string
      responses:
        "204":
          description: No Content
`,
        logger,
        (compileError) => {
          error = compileError;
          done();
        },
      );
    });

    it('aborts Dredd', () => {
      assert.instanceOf(error, Error);
    });
    it('logs errors', () => {
      assert.equal(logger.log.getCall(0).args[0], 'error');
    });
    it('logs the URI parameters validation error', () => {
      assert.match(
        logger.log.getCall(0).args[1],
        /API description URI parameters validation error in configuration\.apiDescriptions\[0\].*Required URI parameter 'param' has no example or default value/i,
      );
    });
  });
});
