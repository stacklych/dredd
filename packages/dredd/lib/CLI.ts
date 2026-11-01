import * as RTyped from 'ramda';
import console from 'console'; // Stubbed in tests by esmock
import fs from 'fs';
import minimist from 'minimist';
import os from 'os';
import spawnArgs from 'spawn-args';
import crossSpawn from 'cross-spawn';

import * as configUtils from './configUtils.js';
import Dredd from './Dredd.js';
import ignorePipeErrors from './ignorePipeErrors.js';
import interactiveConfig from './init.js';
import logger from './logger.js';
import { redactConfiguration } from './redact.js';
import { applyLoggingOptions } from './configuration/index.js';
import { spawn } from './childProcess.js';

import dreddOptions from '../options.json' with { type: 'json' };
import packageData from '../package.json' with { type: 'json' };

// ramda's point-free helpers fight @types/ramda's conditional return types;
// the result of mergeDeepRight is read with dynamic keys, so treat R as `any`.
const R: any = RTyped;

function getAliases(options: Record<string, any>) {
  return Object.keys(options).reduce(
    (aliases, optionName) => {
      if (options[optionName].alias) {
        aliases[optionName] = options[optionName].alias;
      }
      return aliases;
    },
    {} as Record<string, any>,
  );
}

function getArrayOptions(options: Record<string, any>) {
  return Object.keys(options).filter((optionName) =>
    Array.isArray(options[optionName].default),
  );
}

function getBooleanOptions(options: Record<string, any>) {
  return Object.keys(options).filter(
    (optionName) =>
      options[optionName].boolean === true ||
      typeof options[optionName].default === 'boolean',
  );
}

function getDefaults(options: Record<string, any>) {
  return Object.keys(options).reduce(
    (defaults, optionName) => {
      if (
        Object.prototype.hasOwnProperty.call(options[optionName], 'default')
      ) {
        defaults[optionName] = options[optionName].default;
      }
      return defaults;
    },
    {} as Record<string, any>,
  );
}

function syncAliases(argv: Record<string, any>, aliases: Record<string, any>) {
  Object.keys(aliases).forEach((optionName) => {
    const alias = aliases[optionName];
    if (Object.prototype.hasOwnProperty.call(argv, optionName)) {
      argv[alias] = argv[optionName];
    } else if (Object.prototype.hasOwnProperty.call(argv, alias)) {
      argv[optionName] = argv[alias];
    }
  });
}

function normalizeArrayOptions(
  argv: Record<string, any>,
  arrayOptions: string[],
  aliases: Record<string, any>,
) {
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

function parseArgv(
  rawArgv: string[],
  options: Record<string, any> = {},
): minimist.ParsedArgs {
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

// The options given on the command line, with the values parsed according to
// their definitions (types, arrays, aliases) but without any defaults, so
// they can override a configuration file without resetting what it sets.
// `rawArgv` is the same command line parsed without option definitions; it
// only tells which options were given.
function pickGivenOptions(
  argv: Record<string, any>,
  rawArgv: Record<string, any>,
  options: Record<string, any>,
) {
  const aliases = getAliases(options);
  const canonical: Record<string, string> = {};
  Object.keys(aliases).forEach((name) => {
    canonical[aliases[name]] = name;
  });

  const given: Record<string, any> = { _: argv._, $0: argv.$0 };
  Object.keys(rawArgv).forEach((key) => {
    if (key === '_' || key === '$0') {
      return;
    }
    const name = canonical[key] || key;
    given[name] = Object.prototype.hasOwnProperty.call(argv, name)
      ? argv[name]
      : rawArgv[key];
    if (aliases[name]) {
      given[aliases[name]] = given[name];
    }
  });
  return given;
}

function formatHelp(usage: string, options: Record<string, any>): string {
  const optionLines = Object.keys(options).map((optionName) => {
    const option = options[optionName];
    const aliases = option.alias ? `, -${option.alias}` : '';
    return `  --${optionName}${aliases}\n    ${option.description || ''}`;
  });
  return `${usage}\n\nOptions:\n${optionLines.join('\n')}`;
}

function createArgumentParser(rawArgv: string[]) {
  return {
    argv: parseArgv(rawArgv),
    optionDefinitions: {} as Record<string, any>,
    usageText: '',
    usage(text: string) {
      this.usageText = text;
      return this;
    },
    options(options: Record<string, any>) {
      this.optionDefinitions = options;
      this.argv = parseArgv(rawArgv, options);
      return this;
    },
    wrap() {
      return this;
    },
    showHelp(printer: (help: string) => void) {
      printer(formatHelp(this.usageText, this.optionDefinitions));
    },
  };
}

class CLI {
  // `cb` and `exit` are dependency-injected exit hooks invoked from inside
  // closures (where TS can't narrow the optional away); type them loosely.
  cb: any;
  finished: boolean;
  exit: any;
  custom: Record<string, any>;
  _processExit: (exitStatus: number) => any;
  sigIntEventAdd?: boolean;
  sigIntEventAdded?: boolean;
  // Late-bound runtime members assigned across methods (dynamic arg bags, the
  // spawned server process, the argument parser, the Dredd instance).
  argumentParser: any;
  cliArgv: any;
  argv: any;
  serverProcess: any;
  dreddInstance: any;
  server: any;
  wait: any;

  constructor(
    options: {
      exit?: (status: number) => void;
      custom?: Record<string, any>;
    } = {},
    cb?: (status: number) => void,
  ) {
    this.cb = cb;
    this.finished = false;
    this.exit = options.exit;
    this.custom = options.custom || {};

    this._processExit = this.setExitOrCallback();

    // Bind the SIGINT handler once so the same function reference is used for
    // both `process.on` and `process.removeListener`, and so `this` refers to
    // the CLI instance when the handler fires.
    this.commandSigInt = this.commandSigInt.bind(this);
    this.commandSigTerm = this.commandSigTerm.bind(this);

    if (!this.custom.cwd || typeof this.custom.cwd !== 'string') {
      this.custom.cwd = process.cwd();
    }

    if (!this.custom.argv || !Array.isArray(this.custom.argv)) {
      this.custom.argv = [];
    }
  }

  setParsedArgv() {
    this.argumentParser = createArgumentParser(this.custom.argv);
    // Parsed without option definitions: tells which options were given.
    const rawArgv = this.argumentParser.argv;

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

    this.argv = this.argumentParser.argv;
    // `argv`/`cliArgv` are dynamic merged arg bags reassigned across methods
    // (and self-referenced in `argv.path = [argv.path]`); type them `any`.
    // `cliArgv` holds only the given options, parsed like `argv`, so that
    // `loadDreddFile` can lay them over a configuration file.
    this.cliArgv = pickGivenOptions(this.argv, rawArgv, dreddOptions);
    applyLoggingOptions(this.argv);
  }

  // Gracefully terminate server
  stopServer(callback: () => void) {
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
      // The real CLI (bin/dredd) passes no `exit`, so it uses process.exit.
      if (!this.exit || this.exit === process.exit) {
        this.sigIntEventAdd = true;
      }

      if (this.exit) {
        return (exitStatus: number) => {
          logger.debug(
            `Using configured custom exit() method to terminate the Dredd process with status '${exitStatus}'.`,
          );
          this.finished = true;
          this.stopServer(() => {
            this.exit(exitStatus);
          });
        };
      }
      return (exitStatus: number) => {
        logger.debug(
          `Using native process.exit() method to terminate the Dredd process with status '${exitStatus}'.`,
        );
        this.stopServer(() => process.exit(exitStatus));
      };
    }
    return (exitStatus: number) => {
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
        process.removeListener('SIGTERM', this.commandSigTerm);
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
      this.serverProcess = spawn(command, parsedArgs);
      logger.debug(
        `Starting backend server process with command: ${this.argv.server}`,
      );

      this.serverProcess.stdout.setEncoding('utf8');
      this.serverProcess.stdout.on('data', (data: any) =>
        process.stdout.write(data.toString()),
      );

      this.serverProcess.stderr.setEncoding('utf8');
      this.serverProcess.stderr.on('data', (data: any) =>
        process.stdout.write(data.toString()),
      );

      this.serverProcess.on('signalTerm', () =>
        logger.debug('Gracefully terminating the backend server process'),
      );
      this.serverProcess.on('signalKill', () =>
        logger.debug('Killing the backend server process'),
      );

      this.serverProcess.on('crash', (exitStatus: number, killed: boolean) => {
        if (killed) {
          logger.debug('Backend server process was killed');
        }
      });

      this.serverProcess.on('exit', () => {
        logger.debug('Backend server process exited');
      });

      this.serverProcess.on('error', (err: any) => {
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
  logDebuggingInfo(config: Record<string, any>) {
    logger.debug('Dredd version:', packageData.version);
    logger.debug('Node.js version:', process.version);
    logger.debug('Node.js environment:', process.versions);
    logger.debug('System version:', os.type(), os.release(), os.arch());
    // Spawning npm costs time and fails where npm is not installed, so only
    // do it when the debug output is actually printed.
    if (logger.level === 'debug') {
      const result = crossSpawn.sync('npm', ['--version'], {
        encoding: 'utf8',
      });
      const npmVersion =
        !result.error && result.stdout ? String(result.stdout).trim() : '';
      logger.debug(
        'npm version:',
        npmVersion || 'unable to determine npm version',
      );
    }
    logger.debug('Configuration:', JSON.stringify(redactConfiguration(config)));
  }

  run() {
    try {
      for (const task of [
        this.setParsedArgv,
        this.runExitingActions,
        this.loadDreddFile,
        this.parseCustomConfig,
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
      this.dreddInstance = this.initDredd(configurationForDredd);
    } catch (e) {
      this.exitWithStatus(e as Error);
    }

    ignorePipeErrors(process);

    try {
      this.runServerAndThenDredd();
    } catch (e) {
      const runError = e as Error;
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

  initDredd(configuration: any) {
    return new Dredd(configuration);
  }

  // On SIGTERM, stop the backend server (via `_processExit` -> `stopServer`)
  // and exit with the conventional 128 + 15 status.
  commandSigTerm() {
    logger.error('\nShutting down on SIGTERM');
    this._processExit(143);
  }

  commandSigInt() {
    logger.error('\nShutting down from keyboard interruption (Ctrl+C)');
    // `_processExit` gracefully terminates the backend server process (via
    // `stopServer`) before exiting / invoking the configured exit callback.
    this._processExit(0);
  }

  runDredd(dreddInstance: Dredd) {
    if (this.sigIntEventAdd) {
      // Handle SIGINT from user
      this.sigIntEventAdded = !(this.sigIntEventAdd = false);
      process.on('SIGINT', this.commandSigInt);
      process.on('SIGTERM', this.commandSigTerm);
    }

    logger.debug('Running Dredd instance.');
    dreddInstance.run((error, stats) => {
      logger.debug('Dredd instance run finished.');
      this.exitWithStatus(error, stats);
    });

    return this;
  }

  exitWithStatus(error: any, stats?: any) {
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
