// @ts-check
import { EventEmitter } from 'events';
import fs from 'fs';
import { inherits } from 'util';

import expandTilde from '../expandTilde';
import pathmodule from 'path';

import logger from '../logger';
import reporterOutputLogger from './reporterOutputLogger';
import prettifyResponse from '../prettifyResponse';

/**
 * @typedef {import('../types/reporters').ReporterStats} ReporterStats
 */

// Escape the XML metacharacters relevant to a double-quoted attribute value
// (test titles are emitted as the `name="..."` attribute). `&` must be replaced
// first so the entities introduced afterwards are not double-escaped.
/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeXML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {import('events').EventEmitter} emitter
 * @param {ReporterStats} stats
 * @param {string} [path]
 * @param {boolean} [details]
 */
function XUnitReporter(emitter, stats, path, details) {
  // EventEmitter superclass init; the prototype link is set up via inherits()
  // below, which TypeScript can't follow, so call through a Function cast.
  /** @type {Function} */ (EventEmitter).call(this);

  this.type = 'xunit';
  this.stats = stats;
  this.details = details;
  this.path = this.sanitizedPath(path);

  this.configureEmitter(emitter);

  logger.debug(`Using '${this.type}' reporter.`);
}

/**
 * @param {string} path
 * @param {ReporterStats} stats
 * @param {() => void} callback
 */
XUnitReporter.prototype.updateSuiteStats = function updateSuiteStats(
  path,
  stats,
  callback,
) {
  fs.readFile(path, (err, data) => {
    if (!err) {
      const text = data.toString();
      const position = text.indexOf('\n');
      if (position !== -1) {
        const restOfFile = text.substr(position + 1);
        const newStats = this.toTag(
          'testsuite',
          {
            name: 'Dredd Tests',
            tests: stats.tests,
            failures: stats.failures,
            errors: stats.errors,
            skip: stats.skipped,
            timestamp: new Date().toUTCString(),
            time: Number(stats.duration) / 1000,
          },
          false,
        );
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
        fs.writeFile(
          path,
          `${xmlHeader}\n${newStats}\n${restOfFile}</testsuite>`,
          (error) => {
            if (error) {
              reporterOutputLogger.error(error);
            }
            callback();
          },
        );
      } else {
        callback();
      }
    } else {
      reporterOutputLogger.error(err);
      callback();
    }
  });
};

/** @param {string} str */
XUnitReporter.prototype.cdata = function cdata(str) {
  return `<![CDATA[${str}]]>`;
};

/**
 * @param {string} path
 * @param {string} line
 */
XUnitReporter.prototype.appendLine = function appendLine(path, line) {
  fs.appendFileSync(path, `${line}\n`);
};

/**
 * @param {string} name
 * @param {Record<string, string | number> | null} attrs
 * @param {boolean} close
 * @param {string} [content]
 * @returns {string}
 */
XUnitReporter.prototype.toTag = function toTag(name, attrs, close, content) {
  const end = close ? '/>' : '>';
  /** @type {string[]} */
  const pairs = [];
  if (attrs) {
    Object.keys(attrs).forEach((key) => pairs.push(`${key}="${attrs[key]}"`));
  }
  let tag = `<${name}${pairs.length ? ` ${pairs.join(' ')}` : ''}${end}`;
  if (content) {
    tag += `${content}</${name}${end}`;
  }
  return tag;
};

/** @param {string} [path] */
XUnitReporter.prototype.sanitizedPath = function sanitizedPath(
  path = './report.xml',
) {
  const filePath = pathmodule.resolve(expandTilde(path));
  if (fs.existsSync(filePath)) {
    logger.warn(`File exists at ${filePath}, will be overwritten...`);
    fs.unlinkSync(filePath);
  }
  return filePath;
};

/** @param {import('events').EventEmitter} emitter */
XUnitReporter.prototype.configureEmitter = function configureEmitter(emitter) {
  emitter.on('start', (apiDescriptions, callback) => {
    fs.promises
      .mkdir(pathmodule.dirname(this.path), { recursive: true })
      .then(() => {
        this.appendLine(
          this.path,
          this.toTag(
            'testsuite',
            {
              name: 'Dredd Tests',
              tests: this.stats.tests,
              failures: this.stats.failures,
              errors: this.stats.errors,
              skip: this.stats.skipped,
              timestamp: new Date().toUTCString(),
              time: Number(this.stats.duration) / 1000,
            },
            false,
          ),
        );
        callback();
      })
      .catch((err) => {
        reporterOutputLogger.error(err);
        callback();
      });
  });

  emitter.on('end', (callback) => {
    this.updateSuiteStats(this.path, this.stats, callback);
  });

  emitter.on('test pass', (test) => {
    const attrs = {
      name: escapeXML(test.title),
      time: Number(test.duration) / 1000,
    };

    if (this.details) {
      const deets = `\
\nRequest:
${prettifyResponse(test.request)}
Expected:
${prettifyResponse(test.expected)}
Actual:
${prettifyResponse(test.actual)}\
`;
      this.appendLine(
        this.path,
        this.toTag(
          'testcase',
          attrs,
          false,
          this.toTag('system-out', null, false, this.cdata(deets)),
        ),
      );
    } else {
      this.appendLine(this.path, this.toTag('testcase', attrs, true));
    }
  });

  emitter.on('test skip', (test) => {
    const attrs = {
      name: escapeXML(test.title),
      time: Number(test.duration) / 1000,
    };
    this.appendLine(
      this.path,
      this.toTag('testcase', attrs, false, this.toTag('skipped', null, true)),
    );
  });

  emitter.on('test fail', (test) => {
    const attrs = {
      name: escapeXML(test.title),
      time: Number(test.duration) / 1000,
    };
    const diff = `\
Message:
${test.message}
Request:
${prettifyResponse(test.request)}
Expected:
${prettifyResponse(test.expected)}
Actual:
${prettifyResponse(test.actual)}\
`;
    this.appendLine(
      this.path,
      this.toTag(
        'testcase',
        attrs,
        false,
        this.toTag('failure', null, false, this.cdata(diff)),
      ),
    );
  });

  emitter.on('test error', (error, test) => {
    const attrs = {
      name: escapeXML(test.title),
      time: Number(test.duration) / 1000,
    };
    const errorMessage = `\nError: \n${error}\nStacktrace: \n${error.stack}`;
    this.appendLine(
      this.path,
      this.toTag(
        'testcase',
        attrs,
        false,
        this.toTag('failure', null, false, this.cdata(errorMessage)),
      ),
    );
  });
};

inherits(XUnitReporter, EventEmitter);

export default XUnitReporter;
