import async from 'async';
import os from 'os';
import url from 'url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { Ajv2019 } from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';

import addHooks from './addHooks.js';
import validate from './validation/validate.js';
import logger from './logger.js';
import reporterOutputLogger from './reporters/reporterOutputLogger.js';
import packageData from '../package.json' with { type: 'json' };
import sortTransactions from './sortTransactions.js';
import performRequest from './performRequest.js';

const OAS_31_DIALECT = 'https://spec.openapis.org/oas/3.1/dialect/base';
const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const JSON_SCHEMA_2019_09 = 'https://json-schema.org/draft/2019-09/schema';
// Validated by the default (gavel-compatible) path in validateBody.
const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema';

function headersArrayToObject(arr: any): Record<string, any> {
  return Array.from(arr as any[]).reduce(
    (result: Record<string, any>, currentItem: any) => {
      result[currentItem.name] = currentItem.value;
      return result;
    },
    {} as Record<string, any>,
  );
}

function eventCallback(reporterError: any) {
  if (reporterError) {
    logger.error(reporterError.message);
  }
}

function parseJSON(value: any, errorPrefix: string) {
  try {
    return JSON.parse(value);
  } catch (error) {
    const message = `${errorPrefix}: ${(error as Error).message}`;
    // The Error `cause` option is ES2022; Node supports it at runtime, but the
    // compiler's `lib` is es2017, so the 2-argument constructor needs ignoring.
    // @ts-expect-error -- ErrorOptions `cause` is ES2022; compiler lib is es2017
    throw new Error(message, { cause: error });
  }
}

function getSchemaObject(bodySchema: any) {
  if (typeof bodySchema === 'string') {
    return parseJSON(bodySchema, 'Given JSON Schema is not a valid JSON');
  }
  return bodySchema;
}

function getSchemaDialect(bodySchema: any) {
  if (!bodySchema) {
    return null;
  }

  const schema = getSchemaObject(bodySchema);
  return schema && schema.$schema;
}

// Normalizes a `$schema` URI for comparison: no trailing empty fragment '#'.
function normalizeDialectURI(uri: string) {
  return uri.replace(/#$/, '');
}

// Chooses how a body schema is validated, from its `$schema` (set by the
// compiler from the document's `jsonSchemaDialect` or the OpenAPI default):
// - '2020-12' / '2019-09': Ajv for that draft (validateBodySchemaWithAjv);
// - 'default': no `$schema` or draft-07, the default validator;
// - 'unsupported': any other dialect, reported as a validation error.
function getSchemaValidator(bodySchema: any) {
  const dialect = getSchemaDialect(bodySchema);
  if (!bodySchema || typeof dialect !== 'string') {
    return 'default';
  }
  const uri = normalizeDialectURI(dialect);
  if (uri === OAS_31_DIALECT || uri === JSON_SCHEMA_2020_12) {
    return '2020-12';
  }
  if (uri === JSON_SCHEMA_2019_09) {
    return '2019-09';
  }
  if (uri === JSON_SCHEMA_DRAFT_07) {
    return 'default';
  }
  return 'unsupported';
}

function normalizeAjvSchemaDialect(schema: any, validator: string) {
  if (schema && typeof schema.$schema === 'string') {
    return {
      ...schema,
      $schema:
        validator === '2019-09' ? JSON_SCHEMA_2019_09 : JSON_SCHEMA_2020_12,
    };
  }
  return schema;
}

function getErrorProperty(error: any) {
  switch (error.keyword) {
    case 'required':
      return error.params.missingProperty;
    case 'additionalProperties':
      return error.params.additionalProperty;
    default:
      return null;
  }
}

function getDataType(value: any) {
  return value === null ? null : typeof value;
}

function formatJSONSchema202012Error(error: any) {
  const pointer = error.instancePath || '';
  const extraProperty = getErrorProperty(error);
  const location = extraProperty ? `${pointer}/${extraProperty}` : pointer;

  switch (error.keyword) {
    case 'type':
      return `At '${location}' Invalid type: ${getDataType(
        error.data,
      )} (expected ${error.params.type})`;
    case 'required':
      return `At '${location}' Missing required property: ${extraProperty}`;
    case 'enum':
      return `At '${location}' No enum match for: "${error.data}"`;
    default:
      return `At '${location}' ${error.message}`;
  }
}

function createJSONSchemaValidationResult(errors: any[], actualBody: any) {
  return {
    valid: errors.length === 0,
    kind: 'json',
    values: { actual: actualBody },
    errors,
  };
}

function createInvalidJSONValidationResult(error: any, actualBody: any) {
  return createJSONSchemaValidationResult(
    [
      {
        message: `Expected data to be a valid JSON: ${error.message}`,
        location: {
          pointer: '',
          property: [],
        },
      },
    ],
    actualBody,
  );
}

function createUnsupportedDialectValidationResult(
  bodySchema: any,
  actualBody: any,
) {
  return createJSONSchemaValidationResult(
    [
      {
        message:
          `Can't validate the body: JSON Schema dialect '${getSchemaDialect(bodySchema)}' ` +
          'is not supported. Supported dialects are JSON Schema 2020-12 (and the ' +
          'OpenAPI 3.1 base dialect), 2019-09 and draft-07.',
        location: { pointer: '', property: [] },
      },
    ],
    actualBody,
  );
}

function validateBodySchemaWithAjv(
  bodySchema: any,
  actualBody: any,
  validator: string = '2020-12',
) {
  const schema = normalizeAjvSchemaDialect(
    getSchemaObject(bodySchema),
    validator,
  );
  const AjvClass = validator === '2019-09' ? Ajv2019 : Ajv2020;
  const ajv = new AjvClass({ allErrors: true, strict: false, verbose: true });
  (addFormats.default || addFormats)(ajv);
  const validate = ajv.compile(schema);

  let actual;
  try {
    actual = JSON.parse(actualBody);
  } catch (error) {
    return createInvalidJSONValidationResult(error, actualBody);
  }

  validate(actual);

  const errors = (validate.errors || []).map((error: any) => {
    const pointer = error.instancePath || '';
    const extraProperty = getErrorProperty(error);
    const location = extraProperty ? `${pointer}/${extraProperty}` : pointer;
    return {
      message: formatJSONSchema202012Error(error),
      location: {
        pointer: location,
        property: location.split('/').filter(Boolean),
      },
    };
  });

  return createJSONSchemaValidationResult(errors, actualBody);
}

function validateFields(fields: any) {
  return Object.keys(fields).every((fieldName) => fields[fieldName].valid);
}

class TransactionRunner {
  configuration: any;
  logs: any[];
  hookStash: any;
  error: any;
  // Set by `config()` and across the run; loosely typed runtime members.
  multiBlueprint?: boolean;
  parsedUrl: any;
  // Attached to the runner by addHooks (external mutation).
  hooks: any;

  constructor(configuration: any) {
    this.configureTransaction = this.configureTransaction.bind(this);
    this.executeTransaction = this.executeTransaction.bind(this);
    this.configuration = configuration;
    this.logs = [];
    this.hookStash = {};
    this.error = null;
  }

  config(config: any) {
    this.configuration = config;
    this.multiBlueprint = this.configuration.apiDescriptions.length > 1;
  }

  run(transactions: any[], callback: (error?: any) => void) {
    logger.debug('Starting reporters and waiting until all of them are ready');
    this.emitStart((emitStartErr) => {
      if (emitStartErr) {
        return callback(emitStartErr);
      }

      logger.debug('Sorting HTTP transactions');
      transactions = this.configuration.sorted
        ? sortTransactions(transactions)
        : transactions;

      logger.debug('Configuring HTTP transactions');
      transactions = transactions.map(this.configureTransaction.bind(this));

      logger.debug('Reading hook files and registering hooks');
      addHooks(this, transactions, (addHooksError) => {
        if (addHooksError) {
          return callback(addHooksError);
        }

        logger.debug('Executing HTTP transactions');
        this.executeAllTransactions(
          transactions,
          this.hooks,
          (execAllTransErr) => {
            if (execAllTransErr) {
              return callback(execAllTransErr);
            }

            logger.debug(
              'Wrapping up testing and waiting until all reporters are done',
            );
            this.emitEnd(callback);
          },
        );
      });
    });
  }

  emitStart(callback: (error?: any) => void) {
    // More than one reporter is supported
    let reporterCount = this.configuration.emitter.listeners('start').length;
    let started = false;

    // When event 'start' is emitted, function in callback is executed for each
    // reporter registered by listeners
    this.configuration.emitter.emit(
      'start',
      this.configuration.apiDescriptions,
      (reporterError: any) => {
        if (reporterError) {
          logger.error(reporterError.message);
        }

        // Start the runner once every reporter's 'start' callback has fired.
        // Guard with `started` and `<= 0` so the runner starts exactly once
        // even if a reporter invokes its callback more than once.
        reporterCount--;
        if (reporterCount <= 0 && !started) {
          started = true;
          callback();
        }
      },
    );
  }

  executeAllTransactions(
    transactions: any[],
    hooks: any,
    callback: (error?: any) => void,
  ) {
    // Warning: Following lines is "differently" performed by 'addHooks'
    // in TransactionRunner.run call. Because addHooks creates hooks.transactions
    // as an object `{}` with transaction.name keys and value is every
    // transaction, we do not fill transactions from executeAllTransactions here.
    // Transactions is supposed to be an Array here!
    let transaction: any;
    if (!hooks.transactions) {
      hooks.transactions = {};
      for (transaction of transactions) {
        hooks.transactions[transaction.name] = transaction;
      }
    }
    // End of warning

    logger.debug("Running 'beforeAll' hooks");

    this.runHooksForData(hooks.beforeAllHooks, transactions, () => {
      // Iterate over transactions' transaction
      // Because async changes the way referencing of properties work,
      // we need to work with indexes (keys) here, no other way of access.
      return async.timesSeries(
        transactions.length,
        (transactionIndex, iterationCallback) => {
          transaction = transactions[transactionIndex];
          logger.debug(
            `Processing transaction #${transactionIndex + 1}:`,
            transaction.name,
          );

          logger.debug("Running 'beforeEach' hooks");
          this.runHooksForData(hooks.beforeEachHooks, transaction, () => {
            logger.debug("Running 'before' hooks");
            this.runHooksForData(
              hooks.beforeHooks[transaction.name],
              transaction,
              () => {
                // This method:
                // - skips and fails based on hooks or options
                // - executes a request
                // - recieves a response
                // - runs beforeEachValidation hooks
                // - runs beforeValidation hooks
                // - runs response validation
                this.executeTransaction(transaction, hooks, () => {
                  logger.debug("Running 'afterEach' hooks");
                  this.runHooksForData(
                    hooks.afterEachHooks,
                    transaction,
                    () => {
                      logger.debug("Running 'after' hooks");
                      this.runHooksForData(
                        hooks.afterHooks[transaction.name],
                        transaction,
                        () => {
                          logger.debug(
                            `Evaluating results of transaction execution #${
                              transactionIndex + 1
                            }:`,
                            transaction.name,
                          );
                          this.emitResult(transaction, iterationCallback);
                        },
                      );
                    },
                  );
                });
              },
            );
          });
        },
        (iterationError) => {
          if (iterationError) {
            return callback(iterationError);
          }

          logger.debug("Running 'afterAll' hooks");
          this.runHooksForData(hooks.afterAllHooks, transactions, () => {
            callback();
          });
        },
      );
    });
  }

  // The 'data' argument can be 'transactions' array or 'transaction' object
  runHooksForData(hooks: any, data: any, callback: (error?: any) => void) {
    if (hooks && hooks.length) {
      logger.debug('Running hooks...');

      // Capture outer this
      const runHookWithData = (
        hookFnIndex: number,
        runHookCallback: () => void,
      ) => {
        const hookFn = hooks[hookFnIndex];
        // Treat assertion failures from hooks (chai or node:assert, both
        // expose name === 'AssertionError') as a failed transaction rather
        // than a hook error, whether thrown or rejected.
        const handleHookError = (caught: any) => {
          const error = caught as any;
          if (error && error.name === 'AssertionError') {
            const transactions = Array.isArray(data) ? data : [data];
            for (const transaction of transactions) {
              this.failTransaction(
                transaction,
                `Failed assertion in hooks: ${error.message}`,
              );
            }
          } else {
            logger.debug('Hook errored:', error);
            this.emitHookError(error, data);
          }
        };
        // Guard so the iteration callback fires exactly once. The try/catch
        // below also wraps the inner `runHook` callback, so without this guard
        // an error thrown after the callback (e.g. in `runHookCallback` or
        // `emitHookError`) would invoke `runHookCallback` twice and execute the
        // rest of the run twice.
        let advanced = false;
        const advance = () => {
          if (advanced) {
            return;
          }
          advanced = true;
          runHookCallback();
        };
        try {
          this.runHook(hookFn, data, (err: any) => {
            if (err) {
              handleHookError(err);
            }
            advance();
          });
        } catch (caught) {
          handleHookError(caught);
          advance();
        }
      };

      async.timesSeries(hooks.length, runHookWithData, () => callback());
    } else {
      callback();
    }
  }

  // The 'data' argument can be 'transactions' array or 'transaction' object.
  //
  // If it's 'transactions', it is treated as single 'transaction' anyway in this
  // function. That probably isn't correct and should be fixed eventually
  // (beware, tests count with the current behavior).
  emitHookError(error: any, data: any) {
    if (!(error instanceof Error)) {
      error = new Error(error);
    }
    const test = this.createTest(data);
    test.request = data.request;
    this.emitError(error, test);
  }

  // Runs one hook and calls `callback` exactly once when it is done:
  // - a hook declaring two parameters `(data, done)` is done when it calls
  //   `done()`;
  // - any other hook (no parameters, or just `data`) is done when it returns,
  //   or, if it returns a promise (an `async` function), when that settles.
  // A rejected promise or an error thrown asynchronously is passed to
  // `callback`; an error thrown synchronously propagates to the caller.
  runHook(hook: any, data: any, callback: (error?: any) => void) {
    let called = false;
    const finish = (error?: any) => {
      if (called) {
        return;
      }
      called = true;
      callback(error);
    };
    const handleResult = (result: any, settle: boolean) => {
      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            if (settle) {
              finish();
            }
          },
          (error: any) =>
            finish(error || new Error('Hook returned a rejected promise')),
        );
      } else if (settle) {
        finish();
      }
    };

    if (hook.length === 2) {
      handleResult(
        hook(data, () => finish()),
        false,
      );
    } else {
      handleResult(hook(data), true);
    }
  }

  configureTransaction(transaction: any) {
    const { configuration } = this;
    const { origin, request, response } = transaction;

    // Parse the server URL (just once, caching it in @parsedUrl)
    if (!this.parsedUrl) {
      this.parsedUrl = this.parseServerUrl(configuration.endpoint);
    }
    const serverPath = `${this.parsedUrl.pathname}${this.parsedUrl.search}`;
    const fullPath = this.getFullPath(serverPath, request.uri);

    const headers = headersArrayToObject(request.headers);

    // Add Dredd User-Agent (if no User-Agent is already present)
    const hasUserAgent = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .includes('user-agent');
    if (!hasUserAgent) {
      const system = `${os.type()} ${os.release()}; ${os.arch()}`;
      headers['User-Agent'] = `Dredd/${packageData.version} (${system})`;
    }

    // Parse and add headers from the config to the transaction
    if (configuration.header.length > 0) {
      for (const header of configuration.header) {
        const splitIndex = header.indexOf(':');
        const headerKey = header.substring(0, splitIndex);
        const headerValue = header.substring(splitIndex + 1);
        headers[headerKey] = headerValue;
      }
    }
    request.headers = headers;

    // The data models as used here must conform to the shape the validator
    // (lib/validation) expects for an `expected` HTTP response.
    const expected: any = { headers: headersArrayToObject(response.headers) };
    if (response.body) {
      expected.body = response.body;
    }
    if (response.status) {
      expected.statusCode = response.status;
    }
    if (response.schema) {
      expected.bodySchema = response.schema;
    }

    // Backward compatible transaction name hack. Transaction names will be
    // replaced by Canonical Transaction Paths: https://github.com/apiaryio/dredd/issues/227
    if (!this.multiBlueprint) {
      transaction.name = transaction.name.replace(
        `${transaction.origin.apiName} > `,
        '',
      );
    }

    // Transaction skipping (can be modified in hooks).
    const skip = false;
    delete transaction.apiDescription;

    const configuredTransaction = {
      name: transaction.name,
      id: `${request.method} (${expected.statusCode}) ${request.uri}`,
      host: this.parsedUrl.hostname,
      // WHATWG URL returns '' for a missing port; preserve the legacy
      // url.parse() contract of 'null' that hooks/reporters may rely on.
      port: this.parsedUrl.port || null,
      request,
      expected,
      origin,
      fullPath,
      protocol: this.parsedUrl.protocol,
      skip,
    };

    return configuredTransaction;
  }

  parseServerUrl(serverUrl: string) {
    if (!serverUrl.match(/^https?:\/\//i)) {
      // Protocol is missing. Remove any : or / at the beginning of the URL
      // and prepend the URL with 'http://' (assumed as default fallback).
      serverUrl = `http://${serverUrl.replace(/^[:/]*/, '')}`;
    }
    // WHATWG URL replaces the deprecated url.parse(); '.pathname'/'.search'
    // are used in place of the legacy '.path' getter (see configureTransaction).
    return new URL(serverUrl);
  }

  getFullPath(serverPath: string, requestPath: string) {
    if (serverPath === '/') {
      return requestPath;
    }
    if (!requestPath) {
      return serverPath;
    }

    // Join two paths
    //
    // How:
    // Removes all slashes from the beginning and from the end of each segment.
    // Then joins them together with a single slash. Then prepends the whole
    // string with a single slash.
    //
    // Why:
    // Note that 'path.join' won't work on Windows and 'url.resolve' can have
    // undesirable behavior depending on slashes.
    // See also https://github.com/joyent/node/issues/2216
    let segments = [serverPath, requestPath];
    segments = Array.from(segments).map((segment) =>
      segment.replace(/^\/|\/$/g, ''),
    );
    // Keep trailing slash at the end if specified in requestPath
    // and if requestPath isn't only '/'
    const trailingSlash =
      requestPath !== '/' && requestPath.slice(-1) === '/' ? '/' : '';
    return `/${segments.join('/')}${trailingSlash}`;
  }

  // Factory for 'transaction.test' object creation
  createTest(transaction: any): any {
    return {
      status: '',
      title: transaction.id,
      message: transaction.name,
      origin: transaction.origin,
      startedAt: transaction.startedAt,
      errors: transaction.errors,
    };
  }

  // Purposely side-effectish method to ensure "transaction.test"
  // inherits data from the "transaction".
  // Necessary when a test is skipped/failed to contain
  // transaction information that is otherwise missing.
  ensureTestStructure(transaction: any) {
    transaction.test.request = transaction.request;
    transaction.test.expected = transaction.expected;
    transaction.test.actual = transaction.real;
    transaction.test.errors = transaction.errors;
    transaction.test.results = transaction.results;
  }

  // Marks the transaction as failed and makes sure everything in the transaction
  // object is set accordingly. Typically this would be invoked when transaction
  // runner decides to force a transaction to behave as failed.
  failTransaction(transaction: any, reason?: string) {
    transaction.fail = true;

    this.ensureTransactionErrors(transaction);
    if (reason) {
      transaction.errors.push({ severity: 'error', message: reason });
    }

    if (!transaction.test) {
      transaction.test = this.createTest(transaction);
    }
    transaction.test.status = 'fail';
    if (reason) {
      transaction.test.message = reason;
    }

    this.ensureTestStructure(transaction);
  }

  // Marks the transaction as skipped and makes sure everything in the transaction
  // object is set accordingly.
  skipTransaction(transaction: any, reason?: string) {
    transaction.skip = true;

    this.ensureTransactionErrors(transaction);
    if (reason) {
      transaction.errors.push({ severity: 'warning', message: reason });
    }

    if (!transaction.test) {
      transaction.test = this.createTest(transaction);
    }
    transaction.test.status = 'skip';
    if (reason) {
      transaction.test.message = reason;
    }

    this.ensureTestStructure(transaction);
  }

  // Ensures that given transaction object has the "errors" key
  // where custom test run errors (not validation errors) are stored.
  ensureTransactionErrors(transaction: any) {
    if (!transaction.results) {
      transaction.results = {};
    }
    if (!transaction.errors) {
      transaction.errors = [];
    }

    return transaction.errors;
  }

  // Inspects given transaction and emits 'test *' events with 'transaction.test'
  // according to the test's status
  emitResult(transaction: any, callback: (error?: any) => void) {
    if (this.error || !transaction.test) {
      logger.debug(
        'No emission of test data to reporters',
        this.error,
        transaction.test,
      );
      this.error = null; // Reset the error indicator
      return callback();
    }

    if (transaction.skip) {
      logger.debug('Emitting to reporters: test skip');
      this.configuration.emitter.emit(
        'test skip',
        transaction.test,
        eventCallback,
      );
      return callback();
    }

    if (transaction.test.valid) {
      if (transaction.fail) {
        this.failTransaction(
          transaction,
          `Failed in after hook: ${transaction.fail}`,
        );
        logger.debug('Emitting to reporters: test fail');
        this.configuration.emitter.emit(
          'test fail',
          transaction.test,
          eventCallback,
        );
      } else {
        logger.debug('Emitting to reporters: test pass');
        this.configuration.emitter.emit(
          'test pass',
          transaction.test,
          eventCallback,
        );
      }
      return callback();
    }

    logger.debug('Emitting to reporters: test fail');
    this.configuration.emitter.emit(
      'test fail',
      transaction.test,
      eventCallback,
    );
    callback();
  }

  // Emits 'test error' with given test data. Halts the transaction runner.
  emitError(error: any, test: any) {
    logger.debug('Emitting to reporters: test error');
    this.configuration.emitter.emit('test error', error, test, eventCallback);

    // Record the error to halt the transaction runner. Do not overwrite
    // the first recorded error if more of them occured.
    this.error = this.error || error;
  }

  // This is actually doing more some pre-flight and conditional skipping of
  // the transcation based on the configuration or hooks. TODO rename
  executeTransaction(transaction: any, hooks: any, callback?: any) {
    if (!callback) {
      [callback, hooks] = Array.from([hooks, undefined]);
    }

    // Number in miliseconds (UNIX-like timestamp * 1000 precision)
    transaction.startedAt = Date.now();

    const test = this.createTest(transaction);
    logger.debug('Emitting to reporters: test start');
    this.configuration.emitter.emit('test start', test, eventCallback);

    this.ensureTransactionErrors(transaction);

    if (transaction.skip) {
      logger.debug(
        'HTTP transaction was marked in hooks as to be skipped. Skipping',
      );
      transaction.test = test;
      this.skipTransaction(transaction, 'Skipped in before hook');
      return callback();
    }
    if (transaction.fail) {
      logger.debug(
        'HTTP transaction was marked in hooks as to be failed. Reporting as failed',
      );
      transaction.test = test;
      this.failTransaction(
        transaction,
        `Failed in before hook: ${transaction.fail}`,
      );
      return callback();
    }
    if (this.configuration['dry-run']) {
      reporterOutputLogger.info('Dry run. Not performing HTTP request');
      transaction.test = test;
      this.skipTransaction(transaction);
      return callback();
    }
    if (this.configuration.names) {
      reporterOutputLogger.info(transaction.name);
      transaction.test = test;
      this.skipTransaction(transaction);
      return callback();
    }
    if (
      this.configuration.method.length > 0 &&
      !Array.from(this.configuration.method).includes(
        transaction.request.method,
      )
    ) {
      logger.debug(`\
Only ${Array.from(this.configuration.method)
        .map((m) => (m as string).toUpperCase())
        .join(', ')}\
requests are set to be executed. \
Not performing HTTP ${transaction.request.method.toUpperCase()} request.\
`);
      transaction.test = test;
      this.skipTransaction(transaction);
      return callback();
    }
    if (
      this.configuration.only.length > 0 &&
      !Array.from(this.configuration.only).includes(transaction.name)
    ) {
      logger.debug(`\
Only '${this.configuration.only}' transaction is set to be executed. \
Not performing HTTP request for '${transaction.name}'.\
`);
      transaction.test = test;
      this.skipTransaction(transaction);
      return callback();
    }
    this.performRequestAndValidate(test, transaction, hooks, callback);
  }

  // An actual HTTP request, before validation hooks triggering
  // and the response validation is invoked here
  performRequestAndValidate(
    test: any,
    transaction: any,
    hooks: any,
    callback: (error?: any) => void,
  ) {
    const uri =
      url.format({
        protocol: transaction.protocol,
        hostname: transaction.host,
        port: transaction.port,
      }) + transaction.fullPath;
    const options = { http: this.configuration.http };

    performRequest(uri, transaction.request, options, (error, real) => {
      if (error) {
        logger.debug('Requesting tested server errored:', error);
        test.title = transaction.id;
        test.expected = transaction.expected;
        test.request = transaction.request;
        this.emitError(error, test);
        return callback();
      }
      transaction.real = real;

      logger.debug("Running 'beforeEachValidation' hooks");
      this.runHooksForData(
        hooks && hooks.beforeEachValidationHooks,
        transaction,
        () => {
          logger.debug("Running 'beforeValidation' hooks");
          this.runHooksForData(
            hooks && hooks.beforeValidationHooks[transaction.name],
            transaction,
            () => {
              this.validateTransaction(test, transaction, callback);
            },
          );
        },
      );
    });
  }

  // TODO Rewrite this entire method.
  // Motivations:
  // 1. Mutations at place.
  // 2. Constant shadowing and reusage of "validationOutput" object where it could be avoided.
  // 3. Ambiguity between internal "results" and legacy "validationResult[name].results".
  // 4. Mapping with for/of that affects prototype properties.
  validateTransaction(
    test: any,
    transaction: any,
    callback: (error?: any) => void,
  ) {
    logger.debug('Validating HTTP transaction');
    let validationResult: any = { fields: {} };

    try {
      const validator = getSchemaValidator(transaction.expected.bodySchema);
      if (validator !== 'default') {
        const expectedWithoutBody = { ...transaction.expected };
        delete expectedWithoutBody.body;
        delete expectedWithoutBody.bodySchema;

        validationResult = validate(expectedWithoutBody, transaction.real);
        validationResult.fields.body =
          validator === 'unsupported'
            ? createUnsupportedDialectValidationResult(
                transaction.expected.bodySchema,
                transaction.real.body,
              )
            : validateBodySchemaWithAjv(
                transaction.expected.bodySchema,
                transaction.real.body,
                validator,
              );
        validationResult.valid = validateFields(validationResult.fields);
      } else {
        validationResult = validate(transaction.expected, transaction.real);
      }
    } catch (validationError) {
      logger.debug('HTTP transaction validation errored:', validationError);
      this.emitError(validationError, test);
    }

    test.title = transaction.id;
    test.actual = transaction.real;
    test.expected = transaction.expected;
    test.request = transaction.request;

    // TODO
    // The validation result MUST NOT be undefined. Check transaction runner
    // tests to find where and why it is.
    const { valid: isValid } = validationResult;

    if (isValid) {
      test.status = 'pass';
    } else {
      test.status = 'fail';
    }

    // Warn about empty responses
    // Expected is as string, actual is as integer :facepalm:
    const isExpectedResponseStatusCodeEmpty = ['204', '205'].includes(
      test.expected.statusCode
        ? test.expected.statusCode.toString()
        : undefined,
    );
    const isActualResponseStatusCodeEmpty = ['204', '205'].includes(
      test.actual.statusCode ? test.actual.statusCode.toString() : undefined,
    );
    const hasBody = test.expected.body || test.actual.body;
    if (
      (isExpectedResponseStatusCodeEmpty || isActualResponseStatusCodeEmpty) &&
      hasBody
    ) {
      logger.warn(`\
${test.title} HTTP 204 and 205 responses must not \
include a message body: https://tools.ietf.org/html/rfc7231#section-6.3\
`);
    }

    // Create test message from messages of all validation errors
    let message = '';

    // Order-sensitive list of validation fields to output in the log
    // Note that Dredd asserts EXACTLY this order. Make sure to adjust tests upon change.
    const loggedFields = ['headers', 'body', 'statusCode'].filter((fieldName) =>
      Object.prototype.hasOwnProperty.call(validationResult.fields, fieldName),
    );

    loggedFields.forEach((fieldName) => {
      const fieldResult = validationResult.fields[fieldName];
      (fieldResult.errors || []).forEach((fieldError: any) => {
        message += `${fieldName}: ${fieldError.message}\n`;
      });
    });

    test.message = message;

    // Set the validation results and the boolean verdict to the test object
    transaction.results = validationResult;
    test.valid = isValid;
    test.errors = transaction.errors;
    test.results = transaction.results;

    // Propagate test object so 'after' hooks can modify it
    transaction.test = test;

    callback();
  }

  emitEnd(callback: (error?: any) => void) {
    let reporterCount = this.configuration.emitter.listeners('end').length;
    let ended = false;
    this.configuration.emitter.emit('end', () => {
      reporterCount--;
      if (reporterCount <= 0 && !ended) {
        ended = true;
        callback();
      }
    });
  }
}

export default TransactionRunner;
