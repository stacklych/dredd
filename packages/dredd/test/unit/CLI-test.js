import express from 'express';
import esmock from 'esmock';

import sinon from 'sinon';
import { assert } from 'chai';

import * as configUtils from '../../lib/configUtils';
import loggerStub from '../../lib/logger';
import options from '../../options';
import * as packageData from '../../package.json';
import Dredd from '../../lib/Dredd';

// A mutable shallow copy of the configUtils module so its methods can be
// stubbed. ES module namespace objects are sealed (read-only), and esmock
// snapshots the injected mock at load time, so `save` is pre-stubbed here (a
// no-op that also avoids writing a real dredd.yml) and asserted via its call
// history rather than re-stubbed later.
const configUtilsStub = { ...configUtils, save: sinon.stub() };

const PORT = 9876;

let exitStatus;

let stderr = '';
let stdout = '';

const initStub = sinon.stub().callsFake((config, save, callback) => {
  save(config);
  callback();
});

// CLI is loaded through esmock with only its genuinely-faked dependencies
// replaced: the interactive `init` prompt, a mutable `configUtils` copy (so
// `save` can be stubbed), and `console` (routed to the logger so its output is
// captured). Dredd/TransactionRunner/addHooks run for real; the logger and
// cross-spawn are shared singletons stubbed directly. esmock is async, so the
// class is loaded in a `before` hook.
let CLIStub;

function execCommand(custom = {}, cb) {
  stdout = '';
  stderr = '';
  let finished = false;
  new CLIStub(
    {
      custom,
    },
    (code) => {
      if (!finished) {
        finished = true;
        exitStatus = code || 0;
        return cb();
      }
    },
  ).run();
}

describe('CLI class', () => {
  before(async () => {
    CLIStub = (
      await esmock.p('../../lib/CLI.ts', {
        '../../lib/init.ts': { default: initStub },
        '../../lib/configUtils.ts': configUtilsStub,
        '../../lib/logger.ts': { default: loggerStub },
        console: { default: loggerStub },
      })
    ).default;

    const logLevels = ['warn', 'error', 'debug'];
    logLevels.forEach((method) => {
      sinon.stub(loggerStub, method).callsFake((chunk) => {
        stderr += `\n${method}: ${chunk}`;
      });
    });
    sinon.stub(loggerStub, 'log').callsFake((chunk) => {
      stdout += chunk;
    });
  });

  after(() => {
    const logLevels = ['warn', 'error', 'debug', 'log'];
    logLevels.forEach((method) => {
      loggerStub[method].restore();
    });
  });

  describe('when initialized without "new" keyword', () => {
    let dc = null;
    before(() => {
      dc = new CLIStub();
    });

    it('sets finished to false', () => assert.isFalse(dc.finished));

    it('sets custom to an Object with "argv" and "cwd" keys', () => {
      assert.isObject(dc.custom);
      assert.lengthOf(Object.keys(dc.custom), 2);
      assert.property(dc.custom, 'cwd');
      assert.property(dc.custom, 'argv');
    });

    it('sets custom argv to an Array with process.argv', () => {
      assert.isArray(dc.custom != null ? dc.custom.argv : undefined);
      assert.equal(dc.custom != null ? dc.custom.argv.length : undefined, 0);
    });

    it('returns an instanceof CLI', () => assert.instanceOf(dc, CLIStub));
  });

  describe('when initialized with options containing exit callback', () => {
    let dc = null;
    let hasCalledExit;

    before(() => {
      dc = new CLIStub({
        exit() {
          hasCalledExit = true;
        },
      });
      dc.run();
    });

    it('has argv property set to object with parsed CLI properties', () => {
      assert.isObject(dc.argv);
      assert.property(dc.argv, '_');
      assert.isArray(dc.argv._);
    });

    it('should set finished to true (keeps false)', () =>
      assert.isTrue(dc.finished));

    it('ends with an error message about missing blueprint-file', () =>
      assert.include(stderr, 'Must specify path to API description document.'));

    it('ends with an error message about missing api endpoint.', () =>
      assert.include(stderr, 'Must specify URL of the tested API instance.'));

    it('calls exit callback', () => assert.isNotNull(hasCalledExit));
  });

  describe('run', () => {
    let dc;
    let initConfigSpy;
    let lastArgvIsApiEndpointSpy;
    let takeRestOfParamsAsPathSpy;

    before(() => {
      dc = new CLIStub({
        exit() {},
        custom: {
          argv: ['./file.yaml', 'http://127.0.0.1:3000'],
          env: { NO_KEY: 'NO_VAL' },
        },
      });

      sinon.stub(dc, 'initDredd').callsFake((configuration) => {
        const dredd = new Dredd(configuration);
        sinon.stub(dredd, 'run');
        return dredd;
      });

      initConfigSpy = sinon.spy(dc, 'initConfig');
      lastArgvIsApiEndpointSpy = sinon.spy(dc, 'lastArgvIsApiEndpoint');
      takeRestOfParamsAsPathSpy = sinon.spy(dc, 'takeRestOfParamsAsPath');
    });

    after(() => {
      dc.initDredd.restore();
      dc.initConfig.restore();
      dc.lastArgvIsApiEndpoint.restore();
      dc.takeRestOfParamsAsPath.restore();
    });

    describe('with mocked initDredd', () => {
      before(() => dc.run());

      it('should call initConfig', () => assert.equal(initConfigSpy.called, 1));

      it('should call susequent helpers as part of initConfig', () => {
        assert.equal(lastArgvIsApiEndpointSpy.called, 1);
        assert.equal(takeRestOfParamsAsPathSpy.called, 1);
      });

      it('should call initDredd with configuration object', () => {
        assert.equal(dc.initDredd.called, 1);
        assert.isArray(dc.initDredd.firstCall.args);
        assert.lengthOf(dc.initDredd.firstCall.args, 1);
        assert.property(dc.initDredd.firstCall.args[0], 'server');
        assert.property(dc.initDredd.firstCall.args[0], 'path');
        assert.property(dc.initDredd.firstCall.args[0], 'loglevel');
        assert.property(dc.initDredd.firstCall.args[0], 'server');
        assert.property(dc.initDredd.firstCall.args[0], 'custom');

        assert.isObject(dc.dreddInstance);
      });
    });
  });

  describe('run with argv set to load regular blueprint', () => {
    let dc;
    let returnGood = true;

    beforeEach((done) => {
      const app = express();

      app.get('/machines', (req, res) => {
        if (returnGood) {
          return res.json([{ type: 'bulldozer', name: 'willy' }]);
        }
        res.json([{ my: 'another', world: 'service' }]);
      });

      dc = new CLIStub({
        custom: {
          argv: [
            './test/fixtures/single-get.yaml',
            `http://127.0.0.1:${PORT}`,
            '--path=./test/fixtures/single-get.yaml',
          ],
        },
        exit(code) {
          exitStatus = code;
          server.close();
        },
      });

      const server = app.listen(PORT, () => dc.run());

      server.on('close', done);
    });

    describe('with server returning good things', () => {
      before(() => {
        returnGood = true;
      });

      it('returns exit code 0', () => assert.equal(exitStatus, 0));

      it('propagates configuration options to Dredd class', () => {
        assert.equal(
          dc.dreddInstance.configuration.path[0],
          './test/fixtures/single-get.yaml',
        );
        assert.equal(
          dc.dreddInstance.configuration.endpoint,
          `http://127.0.0.1:${PORT}`,
        );
      });
    });

    describe('with server returning wrong things', () => {
      before(() => {
        returnGood = false;
      });

      it('returns exit code 1', () => assert.equal(exitStatus, 1));

      it('propagates configuration options to Dredd class', () => {
        assert.equal(
          dc.dreddInstance.configuration.path[0],
          './test/fixtures/single-get.yaml',
        );
        assert.equal(
          dc.dreddInstance.configuration.endpoint,
          `http://127.0.0.1:${PORT}`,
        );
      });
    });
  });

  describe('when called w/ OR wo/ exiting arguments', () => {
    describe('--help', () => {
      before((done) => execCommand({ argv: ['--help'] }, done));

      it('prints out some really nice help text with all options descriptions', () => {
        assert.include(stderr, 'Usage:');
        assert.include(stderr, 'Example:');
        assert.include(stderr, '[OPTIONS]');
        Array.from(Object.keys(options)).forEach((optionKey) =>
          assert.include(stderr, optionKey),
        );
      });
    });

    describe('--version', () => {
      before((done) => execCommand({ argv: ['--version'] }, done));

      it('prints out version', () => {
        assert.include(stdout, `${packageData.name} v${packageData.version}`);
      });
    });

    describe('init', () => {
      before((done) => {
        configUtilsStub.save.resetHistory();
        execCommand({ argv: ['init'] }, done);
      });

      after(() => {
        configUtilsStub.save.resetHistory();
      });

      it('should run interactive config', () => assert.isTrue(initStub.called));
      it('should save configuration', () =>
        assert.isTrue(configUtilsStub.save.called));
    });

    describe('without argv', () => {
      before((done) => execCommand({ argv: [] }, done));

      it('prints out an error message', () =>
        assert.include(stderr, 'Error: Must specify'));
    });
  });

  describe('when using --server', () => {
    // The backend server child process and the Dredd run are faked: esmock
    // isolates CLI's transitive cross-spawn (reached via childProcess), so the
    // spawn is mocked at the childProcess boundary, and Dredd is stubbed so no
    // real transactions run against the (absent) test server.
    const fakeServerProcess = {
      stdout: { setEncoding() {}, on() {} },
      stderr: { setEncoding() {}, on() {} },
      on(event, cb) {
        if (event === 'exit') {
          setImmediate(cb);
        }
      },
      spawned: true,
      terminated: false,
      terminate() {
        this.terminated = true;
      },
      signalKill() {},
      pid: 1234,
    };
    const childProcessSpawnStub = sinon.stub().returns(fakeServerProcess);

    before((done) => {
      class DreddStub {
        constructor(configuration) {
          this.configuration = configuration;
        }

        run(callback) {
          callback(null, {});
        }
      }

      esmock
        .p('../../lib/CLI.ts', {
          '../../lib/init.ts': { default: initStub },
          '../../lib/configUtils.ts': configUtilsStub,
          '../../lib/logger.ts': { default: loggerStub },
          console: { default: loggerStub },
          '../../lib/childProcess.ts': { spawn: childProcessSpawnStub },
          '../../lib/Dredd.ts': { default: DreddStub },
        })
        .then((mod) => {
          const ServerCLI = mod.default;
          new ServerCLI(
            {
              custom: {
                argv: [
                  './test/fixtures/single-get.yaml',
                  `http://127.0.0.1:${PORT}`,
                  '--server',
                  'foo/bar',
                  '--server-wait=0',
                ],
              },
            },
            () => done(),
          ).run();
        });
    });

    it('should run child process', () =>
      assert.isTrue(childProcessSpawnStub.called));
  });

  describe('option parsing', () => {
    function configurationFor(argv) {
      const dc = new CLIStub({ exit() {}, custom: { argv } });
      sinon.stub(dc, 'initDredd').callsFake((configuration) => {
        const dredd = new Dredd(configuration);
        sinon.stub(dredd, 'run');
        return dredd;
      });
      dc.run();
      return dc.initDredd.firstCall.args[0];
    }

    it('parses the long --custom form into key/value pairs', () => {
      const { custom } = configurationFor([
        './test/fixtures/single-get.yaml',
        'http://127.0.0.1:3000',
        '--custom',
        'apiKey:secret',
      ]);
      assert.propertyVal(custom, 'apiKey', 'secret');
      assert.notProperty(custom, '0');
    });

    it('parses the short -j form into key/value pairs', () => {
      const { custom } = configurationFor([
        './test/fixtures/single-get.yaml',
        'http://127.0.0.1:3000',
        '-j',
        'apiKey:secret',
      ]);
      assert.propertyVal(custom, 'apiKey', 'secret');
    });

    it('does not take a positional argument as the --dry-run value', () => {
      const configuration = configurationFor([
        '--dry-run',
        './test/fixtures/single-get.yaml',
        'http://127.0.0.1:3000',
      ]);
      assert.isTrue(configuration['dry-run']);
      assert.equal(configuration.server, 'http://127.0.0.1:3000');
      assert.include(configuration.path, './test/fixtures/single-get.yaml');
    });
  });

  describe('logDebuggingInfo() when npm is not on PATH', () => {
    let originalPath;
    let originalLevel;
    let calls;

    before(() => {
      originalPath = process.env.PATH;
      originalLevel = loggerStub.level;
      process.env.PATH = '/nonexistent';
      loggerStub.level = 'debug';
      calls = loggerStub.debug.getCalls().length;
      new CLIStub({ exit() {}, custom: { argv: [] } }).logDebuggingInfo({});
    });

    after(() => {
      process.env.PATH = originalPath;
      loggerStub.level = originalLevel;
    });

    it('logs that the npm version is unknown instead of crashing', () => {
      const npmCall = loggerStub.debug
        .getCalls()
        .slice(calls)
        .find((call) => call.args[0] === 'npm version:');
      assert.equal(npmCall.args[1], 'unable to determine npm version');
    });
  });

  describe('when constructed like bin/dredd (no exit, no callback)', () => {
    it('installs the SIGINT/SIGTERM handlers that stop the backend server', () => {
      const dc = new CLIStub({ custom: { argv: [] } });
      assert.isTrue(dc.sigIntEventAdd);
    });
  });

  describe('when constructed with a callback', () => {
    it('leaves signal handling to the caller', () => {
      const dc = new CLIStub({ custom: { argv: [] } }, () => {});
      assert.notOk(dc.sigIntEventAdd);
    });
  });
});
