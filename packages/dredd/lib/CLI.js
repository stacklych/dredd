// @ts-check
import R from 'ramda';
import console from 'console'; // Stubbed in tests by proxyquire
import fs from 'fs';
import minimist from 'minimist';
import os from 'os';
import spawnArgs from 'spawn-args';
import { spawn as spawnSync } from 'cross-spawn';

import * as configUtils from './configUtils';
import Dredd from './Dredd';
import ignorePipeErrors from './ignorePipeErrors';
import interactiveConfig from './init';
import logger from './logger';
import { applyLoggingOptions } from './configuration';
import { spawn } from './childProcess';

import dreddOptions from '../options.json';
import packageData from '../package.json';

/** @param {Record<string, any>} options */
function getAliases(options) {
  return Object.keys(options).reduce((aliases, optionName) => {
    if (options[optionName].alias) {
      aliases[optionName] = options[optionName].alias;
    }
    return aliases;
  }, /** @type {Record<string, any>} */ ({}));
}

/** @param {Record<string, any>} options */
function getArrayOptions(options) {
  return Object.keys(options).filter((optionName) =>
    Array.isArray(options[optionName].default),
  );
}

/** @param {Record<string, any>} options */
function getBooleanOptions(options) {
  return Object.keys(options).filter(
    (optionName) =>
      options[optionName].boolean === true ||
      typeof options[optionName].default === 'boolean',
  );
}

/** @param {Record<string, any>} options */
function getDefaults(options) {
  return Object.keys(options).reduce((defaults, optionName) => {
    if (Object.prototype.hasOwnProperty.call(options[optionName], 'default')) {
      defaults[optionName] = options[optionName].default;
    }
    return defaults;
  }, /** @type {Record<string, any>} */ ({}));
}

/**
 * @param {Record<string, any>} argv
 * @param {Record<string, any>} aliases
 */
function syncAliases(argv, aliases) {
  Object.keys(aliases).forEach((optionName) => {
    const alias = aliases[optionName];
    if (Object.prototype.hasOwnProperty.call(argv, optionName)) {
      argv[alias] = argv[optionName];
    } else if (Object.prototype.hasOwnProperty.call(argv, alias)) {
      argv[optionName] = argv[alias];
    }
  });
}

/**
 * @param {Record<string, any>} argv
 * @param {string[]} arrayOptions
 * @param {Record<string, any>} aliases
 */
function normalizeArrayOptions(argv, arrayOptions, aliases) {
  arrayOptions.forEach((optionName) => {
    const value = argv[optionName];
    if (Array.isArray(value)) {
      argv[optionName] = value;
    } else if (value === undefined || value === null) {
      argv[optionName] = [];
    } else {
      argv[optionName] = [value];
    }

    if (aliases[optionName]) {
      argv[aliases[optionName]] = argv[optionName];
    }
  });
}

/**
 * @param {string[]} rawArgv
 * @param {Record<string, any>} [options]
 * @returns {import('minimist').ParsedArgs}
 */
function parseArgv(rawArgv, options = {}) {
  const aliases = getAliases(options);
  const argv = minimist(rawArgv, {
    alias: aliases,
    boolean: getBooleanOptions(options),
    default: getDefaults(options),
  });
  argv.$0 = 'dredd';
  syncAliases(argv, aliases);
  normalizeArrayOptions(argv, getArrayOptions(options), aliases);
  return argv;
}

/**
 * @param {string} usage
 * @param {Record<string, any>} options
 * @returns {string}
 */
function formatHelp(usage, options) {
  const optionLines = Object.keys(options).map((optionName) => {
    const option = options[optionName];
    const aliases = option.alias ? `, -${option.alias}` : '';
    return `  --${optionName}${aliases}\n    ${option.description || ''}`;
  });
  return `${usage}\n\nOptions:\n${optionLines.join('\n')}`;
}

/** @param {string[]} rawArgv */
function createArgumentParser(rawArgv) {
  return {
    argv: parseArgv(rawArgv),
    /** @type {Record<string, any>} */
    optionDefinitions: {},
    usageText: '',
    /** @param {string} text */
    usage(text) {
      this.usageText = text;
      return this;
    },
    /** @param {Record<string, any>} options */
    options(options) {
      this.optionDefinitions = options;
      this.argv = parseArgv(rawArgv, options);
      return this;
    },
    wrap() {
      return this;
    },
    /** @param {(help: string) => void} printer */
    showHelp(printer) {
      printer(formatHelp(this.usageText, this.optionDefinitions));
    },
  };
}

class CLI {
  /**
   * @param {{ exit?: (status: number) => void, custom?: Record<string, any> }} [options]
   * @param {(status: number) => void} [cb]
   */
  constructor(options = {}, cb) {
    // `cb` and `exit` are dependency-injected exit hooks invoked from inside
    // closures (where TS can't narrow the optional away); type them loosely.
    /** @type {any} */
    this.cb = cb;
    this.finished = false;
    /** @type {any} */
    this.exit = options.exit;
    this.custom = options.custom || {};

    this._processExit = this.setExitOrCallback();

    // Bind the SIGINT handler once so the same function reference is used for
    // both `process.on` and `process.removeListener`, and so `this` refers to
    // the CLI instance when the handler fires.
    this.commandSigInt = this.commandSigInt.bind(this);

    if (!this.custom.cwd || typeof this.custom.cwd !== 'string') {
      this.custom.cwd = process.cwd();
    }

    if (!this.custom.argv || !Array.isArray(this.custom.argv)) {
      this.custom.argv = [];
    }
  }

  setParsedArgv() {
    // The argument parser is created here (not in the constructor), so it reads
    // as possibly-undefined to the checker unless typed loosely.
    /** @type {any} */
    this.argumentParser = createArgumentParser(this.custom.argv);
    // `argv`/`cliArgv` are dynamic merged arg bags reassigned across methods
    // (and self-referenced in `argv.path = [argv.path]`); type them `any`.
    /** @type {any} */
    this.cliArgv = this.argumentParser.argv;

    this.argumentParser
      .usage(
        `\
Usage:
  $ dredd init

Or:
  $ dredd <path or URL to API description document> <URL of tested server> [OPTIONS]

Example:
  $ dredd ./api-description.yaml http://127.0.0.1:3000 --dry-run\
`,
      )
      .options(dreddOptions)
      .wrap();

    /** @type {any} */
    this.argv = this.argumentParser.argv;
    applyLoggingOptions(this.argv);
  }

  // Gracefully terminate server
  /** @param {() => void} callback */
  stopServer(callback) {
    if (!this.serverProcess || !this.serverProcess.spawned) {
      logger.debug('No backend server process to terminate.');
      return callback();
    }
    if (this.serverProcess.terminated) {
      logger.debug('The backend server process has already terminated');
      return callback();
    }
    logger.debug(
      'Terminating backend server process, PID',
      this.serverProcess.pid,
    );
    this.serverProcess.terminate({ force: true });
    this.serverProcess.on('exit', () => callback());
  }

  // This thing-a-ma-bob here is only for purpose of testing
  // It's basically a dependency injection for the process.exit function
  // Returns the configured process-exit function (assigned to `_processExit`
  // in the constructor). Returning it — rather than assigning `this._processExit`
  // from inside here — lets the type checker see it as definitely assigned.
  setExitOrCallback() {
    if (!this.cb) {
      if (this.exit && this.exit === process.exit) {
        this.sigIntEventAdd = true;
      }

      if (this.exit) {
        return (/** @type {number} */ exitStatus) => {
          logger.debug(
            `Using configured custom exit() method to terminate the Dredd process with status '${exitStatus}'.`,
          );
          this.finished = true;
          this.stopServer(() => {
            this.exit(exitStatus);
          });
        };
      }
      return (/** @type {number} */ exitStatus) => {
        logger.debug(
          `Using native process.exit() method to terminate the Dredd process with status '${exitStatus}'.`,
        );
        this.stopServer(() => process.exit(exitStatus));
      };
    }
    return (/** @type {number} */ exitStatus) => {
      logger.debug(
        `Using configured custom callback to terminate the Dredd process with status '${exitStatus}'.`,
      );
      this.finished = true;
      if (this.sigIntEventAdded) {
        if (this.serverProcess && !this.serverProcess.terminated) {
          logger.debug('Killing backend server process before Dredd exits.');
          this.serverProcess.signalKill();
        }
        process.removeListener('SIGINT', this.commandSigInt);
      }
      this.cb(exitStatus);
      return this;
    };
  }

  moveBlueprintArgToPath() {
    // Transform path and p argument to array if it's not
    if (!Array.isArray(this.argv.path)) {
      this.argv.path = this.argv.p = [this.argv.path];
    }
  }

  checkRequiredArgs() {
    let argError = false;

    // If 'blueprint' is missing
    if (!this.argv._[0]) {
      console.error('\nError: Must specify path to API description document.');
      argError = true;
    }

    // If 'endpoint' is missing
    if (!this.argv._[1]) {
      console.error('\nError: Must specify URL of the tested API instance.');
      argError = true;
    }

    // Show help if argument is missing
    if (argError) {
      console.error('\n');
      this.argumentParser.showHelp(console.error);
      this._processExit(1);
    }
  }

  runExitingActions() {
    // Run interactive config
    if (this.argv._[0] === 'init' || this.argv.init === true) {
      logger.debug('Starting interactive configuration.');
      this.finished = true;
      interactiveConfig(
        this.argv,
        (config) => {
          configUtils.save(config);
        },
        (err) => {
          if (err) {
            logger.error('Could not configure Dredd', err);
          }
          this._processExit(0);
        },
      );

      // Show help
    } else if (this.argv.help === true) {
      this.argumentParser.showHelp(console.error);
      this._processExit(0);

      // Show version
    } else if (this.argv.version === true) {
      console.log(`\
${packageData.name} v${packageData.version} \
(${os.type()} ${os.release()}; ${os.arch()})\
`);
      this._processExit(0);
    }
  }

  loadDreddFile() {
    const configPath = this.argv.config;
    logger.debug('Loading configuration file:', configPath);

    if (configPath && fs.existsSync(configPath)) {
      logger.debug(
        `Configuration '${configPath}' found, ignoring other arguments.`,
      );
      this.argv = configUtils.load(configPath);
    }

    // Overwrite saved config with cli arguments
    Object.keys(this.cliArgv).forEach((key) => {
      const value = this.cliArgv[key];
      if (key !== '_' && key !== '$0') {
        this.argv[key] = value;
      }
    });

    applyLoggingOptions(this.argv);
  }

  parseCustomConfig() {
    this.argv.custom = configUtils.parseCustom(this.argv.custom);
  }

  runServerAndThenDredd() {
    if (!this.argv.server) {
      logger.debug(
        'No backend server process specified, starting testing at once',
      );
      this.runDredd(this.dreddInstance);
    } else {
      logger.debug(
        'Backend server process specified, starting backend server and then testing',
      );

      const parsedArgs = spawnArgs(this.argv.server);
      const command = parsedArgs.shift();

      logger.debug(
        `Using '${command}' as a server command, ${JSON.stringify(
          parsedArgs,
        )} as arguments`,
      );
      // A spawned child process augmented with Dredd's runtime control methods
      // and custom events ('crash'/'signalTerm'/'signalKill'); typed `any`.
      /** @type {any} */
      this.serverProcess = spawn(command, parsedArgs);
      logger.debug(
        `Starting backend server process with command: ${this.argv.server}`,
      );

      this.serverProcess.stdout.setEncoding('utf8');
      this.serverProcess.stdout.on('data', (/** @type {any} */ data) =>
        process.stdout.write(data.toString()),
      );

      this.serverProcess.stderr.setEncoding('utf8');
      this.serverProcess.stderr.on('data', (/** @type {any} */ data) =>
        process.stdout.write(data.toString()),
      );

      this.serverProcess.on('signalTerm', () =>
        logger.debug('Gracefully terminating the backend server process'),
      );
      this.serverProcess.on('signalKill', () =>
        logger.debug('Killing the backend server process'),
      );

      this.serverProcess.on(
        'crash',
        (/** @type {number} */ exitStatus, /** @type {boolean} */ killed) => {
          if (killed) {
            logger.debug('Backend server process was killed');
          }
        },
      );

      this.serverProcess.on('exit', () => {
        logger.debug('Backend server process exited');
      });

      this.serverProcess.on('error', (/** @type {any} */ err) => {
        logger.error(
          'Command to start backend server process failed, exiting Dredd',
          err,
        );
        this._processExit(1);
      });

      // Ensure server is not running when dredd exits prematurely somewhere
      process.on('beforeExit', () => {
        if (this.serverProcess && !this.serverProcess.terminated) {
          logger.debug('Killing backend server process before Dredd exits');
          this.serverProcess.signalKill();
        }
      });

      // Ensure server is not running when dredd exits prematurely somewhere
      process.on('exit', () => {
        if (this.serverProcess && !this.serverProcess.terminated) {
          logger.debug("Killing backend server process on Dredd's exit");
          this.serverProcess.signalKill();
        }
      });

      const waitSecs = parseInt(this.argv['server-wait'], 10);
      const waitMilis = waitSecs * 1000;
      logger.debug(
        `Waiting ${waitSecs} seconds for backend server process to start`,
      );

      this.wait = setTimeout(() => {
        this.runDredd(this.dreddInstance);
      }, waitMilis);
    }
  }

  // This should be handled in a better way in the future:
  // https://github.com/apiaryio/dredd/issues/625
  /** @param {Record<string, any>} config */
  logDebuggingInfo(config) {
    logger.debug('Dredd version:', packageData.version);
    logger.debug('Node.js version:', process.version);
    logger.debug('Node.js environment:', process.versions);
    logger.debug('System version:', os.type(), os.release(), os.arch());
    try {
      const npmVersion = /** @type {any} */ (
        spawnSync('npm', ['--version'])
      ).stdout
        .toString()
        .trim();
      logger.debug(
        'npm version:',
        npmVersion || 'unable to determine npm version',
      );
    } catch (err) {
      logger.debug('npm version: unable to determine npm version:', err);
    }
    logger.debug('Configuration:', JSON.stringify(config));
  }

  run() {
    try {
      for (const task of [
        this.setParsedArgv,
        this.parseCustomConfig,
        this.runExitingActions,
        this.loadDreddFile,
        this.checkRequiredArgs,
        this.moveBlueprintArgToPath,
      ]) {
        task.call(this);
        if (this.finished) {
          return;
        }
      }

      const configurationForDredd = this.initConfig();
      this.logDebuggingInfo(configurationForDredd);

      // Assigned here in run() rather than the constructor; typed loosely so
      // the later `runDredd(this.dreddInstance)` calls don't see it as undefined.
      /** @type {any} */
      this.dreddInstance = this.initDredd(configurationForDredd);
    } catch (e) {
      this.exitWithStatus(/** @type {Error} */ (e));
    }

    ignorePipeErrors(process);

    try {
      this.runServerAndThenDredd();
    } catch (e) {
      const runError = /** @type {Error} */ (e);
      logger.error(runError.message, runError.stack);
      this.stopServer(() => {
        this._processExit(2);
      });
    }
  }

  lastArgvIsApiEndpoint() {
    // When API description path is a glob, some shells are automatically expanding globs and concating
    // result as arguments so I'm taking last argument as API endpoint server URL and removing it
    // from parsed CLI args
    /** @type {any} */
    this.server = this.argv._[this.argv._.length - 1];
    this.argv._.splice(this.argv._.length - 1, 1);
    return this;
  }

  takeRestOfParamsAsPath() {
    // And rest of arguments concating to 'path' and 'p' opts, duplicates are filtered out later
    this.argv.p = this.argv.path = this.argv.path.concat(this.argv._);
    return this;
  }

  initConfig() {
    this.lastArgvIsApiEndpoint().takeRestOfParamsAsPath();

    const cliConfig = R.mergeDeepRight(this.argv, {
      server: this.server,
    });

    // Push first argument (without some known configuration --key) into paths
    if (!cliConfig.path) {
      cliConfig.path = [];
    }
    cliConfig.path.push(this.argv._[0]);

    // Merge "this.custom" which is an input of CLI constructor
    // (used for internal testing), and "cliConfig" which is a result
    // of merge upon "argv". Otherwise "custom" key from "dredd.yml"
    // is always overridden by "this.custom".
    cliConfig.custom = R.mergeDeepRight(this.custom, cliConfig.custom || {});

    return cliConfig;
  }

  /** @param {any} configuration */
  initDredd(configuration) {
    return new Dredd(configuration);
  }

  commandSigInt() {
    logger.error('\nShutting down from keyboard interruption (Ctrl+C)');
    // `_processExit` gracefully terminates the backend server process (via
    // `stopServer`) before exiting / invoking the configured exit callback.
    this._processExit(0);
  }

  /** @param {Dredd} dreddInstance */
  runDredd(dreddInstance) {
    if (this.sigIntEventAdd) {
      // Handle SIGINT from user
      this.sigIntEventAdded = !(this.sigIntEventAdd = false);
      process.on('SIGINT', this.commandSigInt);
    }

    logger.debug('Running Dredd instance.');
    dreddInstance.run((error, stats) => {
      logger.debug('Dredd instance run finished.');
      this.exitWithStatus(error, stats);
    });

    return this;
  }

  /**
   * @param {any} error
   * @param {any} [stats]
   */
  exitWithStatus(error, stats) {
    if (error) {
      if (error.message) {
        logger.error(error.message);
      }
      this._processExit(1);
      return;
    }

    if (stats.failures + stats.errors > 0) {
      this._processExit(1);
    } else {
      this._processExit(0);
    }
  }
}

export default CLI;
