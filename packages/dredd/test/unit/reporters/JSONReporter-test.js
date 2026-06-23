import fsStub from 'fs';
import sinon from 'sinon';

import { assert } from 'chai';
import { EventEmitter } from 'events';

import loggerStub from '../../../lib/logger';
import reporterOutputLoggerStub from '../../../lib/reporters/reporterOutputLogger';
import JSONReporter from '../../../lib/reporters/JSONReporter';

describe('JSONReporter', () => {
  before(() => {
    loggerStub.transports.console.silent = true;
    reporterOutputLoggerStub.transports.console.silent = true;
  });

  after(() => {
    loggerStub.transports.console.silent = false;
    reporterOutputLoggerStub.transports.console.silent = false;
  });

  describe('when creating', () => {
    describe('when file exists', () => {
      before(() => {
        sinon.stub(fsStub, 'existsSync').callsFake(() => true);
        sinon.stub(loggerStub, 'warn');
      });

      after(() => {
        fsStub.existsSync.restore();
        loggerStub.warn.restore();
      });

      it('should warn about the existing file', () => {
        const emitter = new EventEmitter();
        new JSONReporter(emitter, {}, 'report.json');
        assert.isOk(loggerStub.warn.called);
      });
    });
  });

  describe('when the test run ends', () => {
    const stats = {
      tests: 3,
      passes: 1,
      failures: 1,
      errors: 0,
      skipped: 1,
      start: new Date('2026-06-23T13:00:00.000Z'),
      end: new Date('2026-06-23T13:00:05.000Z'),
      duration: 5000,
    };
    let written;

    beforeEach((done) => {
      written = null;
      sinon.stub(fsStub, 'existsSync').callsFake(() => false);
      sinon.stub(fsStub.promises, 'mkdir').resolves();
      sinon.stub(fsStub, 'writeFile').callsFake((path, data, cb) => {
        written = data;
        cb();
      });

      const emitter = new EventEmitter();
      new JSONReporter(emitter, stats, 'report.json', false);

      emitter.emit('test pass', {
        title: 'GET (200) /a',
        status: 'pass',
        duration: 10,
        request: { method: 'GET' },
        expected: { statusCode: '200' },
        actual: { statusCode: '200' },
      });
      emitter.emit('test skip', { title: 'GET (200) /b', status: 'skip' });
      emitter.emit('test fail', {
        title: 'GET (200) /c',
        status: 'fail',
        duration: 20,
        message: "statusCode: Expected status code '200', but got '400'",
        request: { method: 'GET' },
        expected: { statusCode: '200' },
        actual: { statusCode: '400' },
        results: { valid: false },
      });
      emitter.emit('end', () => done());
    });

    afterEach(() => {
      fsStub.existsSync.restore();
      fsStub.promises.mkdir.restore();
      fsStub.writeFile.restore();
    });

    it('writes valid JSON with format, version, summary and transactions', () => {
      assert.isOk(written);
      const report = JSON.parse(written);
      assert.equal(report.format, 'dredd-json');
      assert.equal(report.version, '1');
      assert.isString(report.generatedAt);
      assert.deepEqual(report.summary, {
        tests: 3,
        passes: 1,
        failures: 1,
        errors: 0,
        skipped: 1,
        start: '2026-06-23T13:00:00.000Z',
        end: '2026-06-23T13:00:05.000Z',
        durationMs: 5000,
      });
      assert.lengthOf(report.transactions, 3);
    });

    it('records each transaction with its name and status', () => {
      const report = JSON.parse(written);
      assert.deepEqual(
        report.transactions.map((t) => t.status),
        ['pass', 'skip', 'fail'],
      );
      assert.equal(report.transactions[2].name, 'GET (200) /c');
      assert.equal(
        report.transactions[2].message,
        "statusCode: Expected status code '200', but got '400'",
      );
    });

    it('always includes detail for failures but gates it for passes when --details is off', () => {
      const report = JSON.parse(written);
      const pass = report.transactions[0];
      const fail = report.transactions[2];
      assert.isUndefined(pass.request);
      assert.isObject(fail.request);
      assert.isObject(fail.results);
    });
  });
});
