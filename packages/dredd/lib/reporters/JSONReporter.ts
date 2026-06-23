import { EventEmitter } from 'events';
import fs from 'fs';
import pathmodule from 'path';

import expandTilde from '../expandTilde.js';
import logger from '../logger.js';
import reporterOutputLogger from './reporterOutputLogger.js';
import type { ReporterStats } from '../types/reporters.js';

interface TransactionResult {
  name: string;
  status: string;
  durationMs?: number;
  message?: string;
  request?: any;
  expected?: any;
  actual?: any;
  results?: any;
}

// Machine-readable reporter. Emits a single JSON document with an aggregate
// `summary` (the run statistics) and a `transactions` array (per-transaction
// results). Intended for automated consumers — e.g. a cron that tracks
// statistics over time — rather than human reading (see the html/markdown
// reporters for that).
class JSONReporter extends EventEmitter {
  type: string;
  stats: ReporterStats;
  details?: boolean;
  path: string;
  transactions: TransactionResult[];

  constructor(
    emitter: EventEmitter,
    stats: ReporterStats,
    path?: string,
    details?: boolean,
  ) {
    super();

    this.type = 'json';
    this.stats = stats;
    this.details = details;
    this.path = this.sanitizedPath(path);
    this.transactions = [];

    this.configureEmitter(emitter);

    logger.debug(`Using '${this.type}' reporter.`);
  }

  sanitizedPath(path = './report.json'): string {
    const filePath = pathmodule.resolve(expandTilde(path));
    if (fs.existsSync(filePath)) {
      logger.warn(`File exists at ${filePath}, will be overwritten...`);
    }
    return filePath;
  }

  // ISO 8601, or null when the timestamp is unset. `stats.start`/`end` are
  // initialized as epoch-ms numbers by Dredd, then overwritten with Date
  // objects by the BaseReporter at runtime, so handle both.
  toISO(value?: Date | number): string | null {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'number' && value > 0) {
      return new Date(value).toISOString();
    }
    return null;
  }

  record(test: any, status: string): void {
    // Failures and errors always carry full detail; passes/skips do so only
    // when --details is set (matching the html/xunit reporters).
    const includeDetail =
      status === 'fail' || status === 'error' || !!this.details;

    const transaction: TransactionResult = {
      name: test.title,
      status,
    };
    if (typeof test.duration === 'number') {
      transaction.durationMs = test.duration;
    }
    if (test.message) {
      transaction.message = test.message;
    }
    if (includeDetail) {
      if (test.request) transaction.request = test.request;
      if (test.expected) transaction.expected = test.expected;
      if (test.actual) transaction.actual = test.actual;
      if (test.results) transaction.results = test.results;
    }

    this.transactions.push(transaction);
  }

  configureEmitter(emitter: EventEmitter): void {
    emitter.on('test pass', (test) => this.record(test, 'pass'));

    emitter.on('test skip', (test) => this.record(test, 'skip'));

    emitter.on('test fail', (test) => this.record(test, 'fail'));

    emitter.on('test error', (error, test) => {
      this.record(test, 'error');
      const last = this.transactions[this.transactions.length - 1];
      if (last && !last.message) {
        last.message = error && error.message ? error.message : String(error);
      }
    });

    emitter.on('end', (callback) => {
      const report = {
        format: 'dredd-json',
        version: '1',
        generatedAt: new Date().toISOString(),
        summary: {
          tests: this.stats.tests,
          passes: this.stats.passes,
          failures: this.stats.failures,
          errors: this.stats.errors,
          skipped: this.stats.skipped,
          start: this.toISO(this.stats.start),
          end: this.toISO(this.stats.end),
          durationMs: this.stats.duration,
        },
        transactions: this.transactions,
      };

      const json = `${JSON.stringify(report, null, 2)}\n`;
      fs.promises
        .mkdir(pathmodule.dirname(this.path), { recursive: true })
        .then(() => {
          fs.writeFile(this.path, json, (error) => {
            if (error) {
              reporterOutputLogger.error(error);
            }
            callback();
          });
        })
        .catch((err) => {
          reporterOutputLogger.error(err);
          callback();
        });
    });
  }
}

export default JSONReporter;
