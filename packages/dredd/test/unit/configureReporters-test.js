/* eslint-disable
    no-return-assign,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
import { EventEmitter } from 'events';

import { assert } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

import loggerStub from '../../lib/logger';
import BaseReporter from '../../lib/reporters/BaseReporter';
import XUnitReporter from '../../lib/reporters/XUnitReporter';
import CLIReporter from '../../lib/reporters/CLIReporter';
import DotReporter from '../../lib/reporters/DotReporter';
import NyanReporter from '../../lib/reporters/NyanReporter';
import HTMLReporter from '../../lib/reporters/HTMLReporter';
import JSONReporter from '../../lib/reporters/JSONReporter';
import MarkdownReporter from '../../lib/reporters/MarkdownReporter';
import ApiaryReporter from '../../lib/reporters/ApiaryReporter';

const BaseReporterStub = sinon.spy(BaseReporter);
const XUnitReporterStub = sinon.spy(XUnitReporter);
const CliReporterStub = sinon.spy(CLIReporter);
const DotReporterStub = sinon.spy(DotReporter);
const NyanCatReporterStub = sinon.spy(NyanReporter);
const HtmlReporterStub = sinon.spy(HTMLReporter);
const JsonReporterStub = sinon.spy(JSONReporter);
const MarkdownReporterStub = sinon.spy(MarkdownReporter);
const ApiaryReporterStub = sinon.spy(ApiaryReporter);

const emitterStub = new EventEmitter();

// esmock injects the reporter spies in place of the real reporter modules so
// the test can assert which reporter configureReporters() instantiates. esmock
// is async, so the configured function is loaded in a `before` hook below.
let configureReporters;

function resetStubs() {
  emitterStub.removeAllListeners();
  BaseReporterStub.resetHistory();
  CliReporterStub.resetHistory();
  XUnitReporterStub.resetHistory();
  DotReporterStub.resetHistory();
  NyanCatReporterStub.resetHistory();
  HtmlReporterStub.resetHistory();
  JsonReporterStub.resetHistory();
  MarkdownReporterStub.resetHistory();
  return ApiaryReporterStub.resetHistory();
}

describe('configureReporters()', () => {
  const configuration = {
    emitter: emitterStub,
    reporter: [],
    output: [],
    'inline-errors': false,
  };

  before(async () => {
    loggerStub.transports.console.silent = true;
    configureReporters = (
      await esmock('../../lib/configureReporters.ts', {
        '../../lib/reporters/BaseReporter.ts': { default: BaseReporterStub },
        '../../lib/reporters/XUnitReporter.ts': { default: XUnitReporterStub },
        '../../lib/reporters/CLIReporter.ts': { default: CliReporterStub },
        '../../lib/reporters/DotReporter.ts': { default: DotReporterStub },
        '../../lib/reporters/NyanReporter.ts': { default: NyanCatReporterStub },
        '../../lib/reporters/HTMLReporter.ts': { default: HtmlReporterStub },
        '../../lib/reporters/JSONReporter.ts': { default: JsonReporterStub },
        '../../lib/reporters/MarkdownReporter.ts': {
          default: MarkdownReporterStub,
        },
        '../../lib/reporters/ApiaryReporter.ts': {
          default: ApiaryReporterStub,
        },
      })
    ).default;
  });

  after(() => (loggerStub.transports.console.silent = false));

  describe('when there are no reporters', () => {
    beforeEach(() => resetStubs());

    it('should only add a CLIReporter', (done) => {
      configureReporters(configuration, {}, null);
      assert.isOk(CliReporterStub.called);
      return done();
    });

    describe('when silent', () => {
      before(() => (configuration.loglevel = 'silent'));

      after(() => (configuration.loglevel = 'silent'));

      beforeEach(() => resetStubs());

      it('should still add reporters', (done) => {
        configureReporters(configuration, {}, null);
        assert.ok(CliReporterStub.called);
        return done();
      });
    });
  });

  describe('when there are only cli-based reporters', () => {
    before(() => (configuration.reporter = ['dot', 'nyan']));

    after(() => (configuration.reporter = []));

    beforeEach(() => resetStubs());

    it('should add a cli-based reporter', (done) => {
      configureReporters(configuration, {}, null);
      assert.isOk(DotReporterStub.called);
      return done();
    });

    it('should not add more than one cli-based reporters', (done) => {
      configureReporters(configuration, {}, null);
      assert.notOk(CliReporterStub.called);
      return done();
    });
  });

  describe('when the json reporter is used', () => {
    before(() => {
      configuration.reporter = ['json'];
      configuration.output = ['report.json'];
    });

    after(() => {
      configuration.reporter = [];
      configuration.output = [];
    });

    beforeEach(() => resetStubs());

    it('should add a JSONReporter with the provided output path', (done) => {
      configureReporters(configuration, {}, () => {});
      assert.isOk(
        JsonReporterStub.calledWith(
          emitterStub,
          { fileBasedReporters: 1 },
          'report.json',
        ),
      );
      return done();
    });
  });

  describe('when there are only file-based reporters', () => {
    before(() => (configuration.reporter = ['xunit', 'markdown']));

    after(() => (configuration.reporter = []));

    beforeEach(() => resetStubs());

    it('should add a CLIReporter', (done) => {
      configureReporters(configuration, {}, () => {});
      assert.isOk(CliReporterStub.called);
      return done();
    });

    describe('when the number of outputs is greater than or equals the number of reporters', () => {
      before(() => (configuration.output = ['file1', 'file2', 'file3']));

      after(() => (configuration.output = []));

      beforeEach(() => resetStubs());

      it('should use the output paths in the order provided', (done) => {
        configureReporters(configuration, {}, () => {});
        assert.isOk(
          XUnitReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file1',
          ),
        );
        assert.isOk(
          MarkdownReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file2',
          ),
        );
        return done();
      });
    });

    describe('when the number of outputs is less than the number of reporters', () => {
      before(() => (configuration.output = ['file1']));

      after(() => (configuration.output = []));

      beforeEach(() => resetStubs());

      it('should use the default output paths for the additional reporters', (done) => {
        configureReporters(configuration, {}, () => {});
        assert.isOk(
          XUnitReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file1',
          ),
        );
        assert.isOk(
          MarkdownReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            undefined,
          ),
        );
        return done();
      });
    });
  });

  describe('when there are both cli-based and file-based reporters', () => {
    before(() => (configuration.reporter = ['nyan', 'markdown', 'html']));

    after(() => (configuration.reporter = []));

    beforeEach(() => resetStubs());

    it('should add a cli-based reporter', (done) => {
      configureReporters(configuration, {}, () => {});
      assert.isOk(NyanCatReporterStub.called);
      return done();
    });

    it('should not add more than one cli-based reporters', (done) => {
      configureReporters(configuration, {}, () => {});
      assert.notOk(CliReporterStub.called);
      assert.notOk(DotReporterStub.called);
      return done();
    });

    describe('when the number of outputs is greather than or equals the number of file-based reporters', () => {
      before(() => (configuration.output = ['file1', 'file2']));

      after(() => (configuration.output = []));

      beforeEach(() => resetStubs());

      it('should use the output paths in the order provided', (done) => {
        configureReporters(configuration, {}, () => {});
        assert.isOk(
          MarkdownReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file1',
          ),
        );
        assert.isOk(
          HtmlReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file2',
          ),
        );
        return done();
      });
    });

    describe('when the number of outputs is less than the number of file-based reporters', () => {
      before(() => (configuration.output = ['file1']));

      after(() => (configuration.output = []));

      beforeEach(() => resetStubs());

      it('should use the default output paths for the additional reporters', (done) => {
        configureReporters(configuration, {}, () => {});
        assert.isOk(
          MarkdownReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            'file1',
          ),
        );
        assert.isOk(
          HtmlReporterStub.calledWith(
            emitterStub,
            { fileBasedReporters: 2 },
            undefined,
          ),
        );
        return done();
      });
    });
  });
});
