import async from 'async';
import parse from '@stacklych/dredd-transactions/parse';
import compile from '@stacklych/dredd-transactions/compile';

import configureReporters from './configureReporters';
import resolveLocations from './resolveLocations';
import readLocation from './readLocation';
import resolveModule from './resolveModule';
import logger from './logger';
import TransactionRunner from './TransactionRunner';
import { applyConfiguration } from './configuration';
import annotationToLoggerInfo from './annotationToLoggerInfo';

import type { EventEmitter } from 'events';

/**
 * The normalized Dredd configuration as produced by `applyConfiguration`.
 * `normalizeConfig` is not yet type-checked, so its return is `any`; this
 * interface captures the fields Dredd reads and forwards to its collaborators.
 */
interface DreddConfiguration {
  custom: { cwd: string };
  path: string[];
  http: Record<string, any>;
  apiDescriptions: any[];
  require?: string;
  emitter: EventEmitter;
  reporter: string[];
  output: string[];
  details: boolean;
  'inline-errors': boolean;
}

/**
 * Dredd's public stats object. `start`/`end`/`duration` start as numbers and
 * are overwritten with Dates by the TransactionRunner at runtime;
 * `fileBasedReporters` is added by `configureReporters` and deleted here.
 */
interface DreddStats {
  tests: number;
  failures: number;
  errors: number;
  passes: number;
  skipped: number;
  start: number;
  end: number;
  duration: number;
  fileBasedReporters?: number;
}

function prefixError(error: Error, prefix: string): Error {
  error.message = `${prefix}: ${error.message}`;
  return error;
}

function prefixErrors(
  decoratedCallback: (error: any, ...args: any[]) => void,
  prefix: string,
): (error: any, ...args: any[]) => void {
  return (error, ...args) => {
    if (error) {
      prefixError(error, prefix);
    }
    decoratedCallback(error, ...args);
  };
}

function readLocations(
  locations: string[],
  options: any,
  callback: (...args: any[]) => void,
) {
  const usesOptions = typeof options !== 'function';
  const resolvedOptions = usesOptions ? options : {};
  const resolvedCallback = usesOptions ? callback : options;

  async.map(
    locations,
    (location, next) => {
      const decoratedNext = prefixErrors(
        next,
        `Unable to load API description document from '${location}'`,
      );
      readLocation(location, resolvedOptions, decoratedNext);
    },
    (error, contents) => {
      if (error) {
        resolvedCallback(error);
        return;
      }

      const apiDescriptions = locations.map((location, i) => ({
        location,
        content: (contents as any[])[i],
      }));
      resolvedCallback(null, apiDescriptions);
    },
  );
}

function parseContent(
  apiDescriptions: Array<{ location: string; content: any }>,
  callback: (...args: any[]) => void,
) {
  async.map(
    apiDescriptions,
    ({ location, content }, next) => {
      const decoratedNext = prefixErrors(
        next,
        `Unable to parse API description document '${location}'`,
      );
      parse(content, decoratedNext);
    },
    (error, parseResults) => {
      if (error) {
        callback(error);
        return;
      }

      const parsedAPIdescriptions = apiDescriptions.map(
        (apiDescription, i) => ({
          ...(parseResults as any[])[i],
          ...apiDescription,
        }),
      );
      callback(null, parsedAPIdescriptions);
    },
  );
}

function compileTransactions(apiDescriptions: any[]): any[] {
  return apiDescriptions
    .map(({ mediaType, apiElements, location }) => {
      try {
        return compile(mediaType, apiElements, location);
      } catch (error) {
        const compileError = error as Error;
        throw prefixError(
          compileError,
          'Unable to compile HTTP transactions from ' +
            `API description document '${location}': ${compileError.message}`,
        );
      }
    })
    .map((compileResult, i) => ({ ...compileResult, ...apiDescriptions[i] }));
}

function toTransactions(
  apiDescriptions: Array<{
    transactions: any[];
    location: string;
    mediaType: string;
  }>,
): any[] {
  return (
    apiDescriptions
      // produce an array of transactions for each API description,
      // where each transaction object gets an extra 'apiDescription'
      // property with details about the API description it comes from
      .map((apiDescription) =>
        apiDescription.transactions.map((transaction) => ({
          apiDescription: {
            location: apiDescription.location,
            mediaType: apiDescription.mediaType,
          },
          ...transaction,
        })),
      )
      // flatten array of arrays
      .reduce((flatArray, array) => flatArray.concat(array), [])
  );
}

function toLoggerInfos(
  apiDescriptions: Array<{ annotations: any[]; location: string }>,
): Array<{ level: string; message: string }> {
  return apiDescriptions
    .map((apiDescription) =>
      apiDescription.annotations.map((annotation) =>
        annotationToLoggerInfo(apiDescription.location, annotation),
      ),
    )
    .reduce(
      (flatAnnotations, annotations) => flatAnnotations.concat(annotations),
      [],
    );
}

class Dredd {
  configuration: DreddConfiguration;
  stats: DreddStats;
  transactionRunner: TransactionRunner;
  logger: typeof logger;

  constructor(config: any) {
    this.configuration = applyConfiguration(config) as DreddConfiguration;
    this.stats = {
      tests: 0,
      failures: 0,
      errors: 0,
      passes: 0,
      skipped: 0,
      start: 0,
      end: 0,
      duration: 0,
    };
    this.transactionRunner = new TransactionRunner(this.configuration);
    this.logger = logger;
  }

  prepareAPIdescriptions(
    callback: (error: any, apiDescriptions?: any[]) => void,
  ) {
    this.logger.debug('Resolving locations of API description documents');
    let locations;
    try {
      locations = resolveLocations(
        this.configuration.custom.cwd,
        this.configuration.path,
      );
    } catch (error) {
      process.nextTick(() => callback(error));
      return;
    }

    async.waterfall(
      [
        (next: (...args: any[]) => void) => {
          this.logger.debug('Reading API description documents');
          readLocations(locations, { http: this.configuration.http }, next);
        },
        (apiDescriptions: any[], next: (...args: any[]) => void) => {
          const allAPIdescriptions =
            this.configuration.apiDescriptions.concat(apiDescriptions);
          this.logger.debug('Parsing API description documents');
          parseContent(allAPIdescriptions, next);
        },
      ],
      (error, apiDescriptions) => {
        if (error) {
          callback(error);
          return;
        }

        this.logger.debug(
          'Compiling HTTP transactions from API description documents',
        );
        let apiDescriptionsWithTransactions;
        try {
          apiDescriptionsWithTransactions = compileTransactions(
            apiDescriptions as any[],
          );
        } catch (compileErr) {
          callback(compileErr);
          return;
        }

        callback(null, apiDescriptionsWithTransactions);
      },
    );
  }

  run(callback: (error: any, stats?: DreddStats) => void) {
    this.logger.debug('Resolving --require');
    if (this.configuration.require) {
      const requirePath = resolveModule(
        this.configuration.custom.cwd,
        this.configuration.require,
      );
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require(requirePath);
      } catch (error) {
        callback(error, this.stats);
        return;
      }
    }

    this.logger.debug('Configuring reporters');
    configureReporters(this.configuration, this.stats, this.transactionRunner);
    // FIXME: 'configureReporters()' pollutes the 'stats' object with
    // this property. Which is unfortunate, as the 'stats' object is
    // a part of Dredd's public interface. This line cleans it up for now, but
    // ideally the property wouldn't be needed at all.
    delete this.stats.fileBasedReporters;

    this.logger.debug('Preparing API description documents');
    this.prepareAPIdescriptions((error, apiDescriptions) => {
      if (error) {
        callback(error, this.stats);
        return;
      }

      // Guaranteed defined on the success path; the callback types it as
      // optional only because the error path omits it.
      const resolvedAPIdescriptions = apiDescriptions as any[];
      const loggerInfos = toLoggerInfos(resolvedAPIdescriptions);
      // Call with the (level, message) signature, not a single loggerInfo
      // object: although Winston 3.x renders both identically, the integration
      // tests in test/integration/annotations-test.js assert on these call
      // arguments (args[0] === level, args[1] === message).
      loggerInfos.forEach(({ level, message }) =>
        this.logger.log(level, message),
      );
      if (loggerInfos.find((loggerInfo) => loggerInfo.level === 'error')) {
        callback(new Error('API description processing error'), this.stats);
        return;
      }

      this.logger.debug('Starting the transaction runner');
      this.configuration.apiDescriptions = resolvedAPIdescriptions;
      this.transactionRunner.config(this.configuration);
      const transactions = toTransactions(resolvedAPIdescriptions);
      this.transactionRunner.run(transactions, (runError: any) => {
        callback(runError, this.stats);
      });
    });
  }
}

export default Dredd;
