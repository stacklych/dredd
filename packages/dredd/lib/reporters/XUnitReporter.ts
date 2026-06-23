import { EventEmitter } from 'events';
import fs from 'fs';
import pathmodule from 'path';

import expandTilde from '../expandTilde';

import logger from '../logger';
import reporterOutputLogger from './reporterOutputLogger';
import prettifyResponse from '../prettifyResponse';
import type { ReporterStats } from '../types/reporters';

// Escape the XML metacharacters relevant to a double-quoted attribute value
// (test titles are emitted as the `name="..."` attribute). `&` must be replaced
// first so the entities introduced afterwards are not double-escaped.
function escapeXML(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class XUnitReporter extends EventEmitter {
  type: string;
  stats: ReporterStats;
  details?: boolean;
  path: string;

  constructor(
    emitter: EventEmitter,
    stats: ReporterStats,
    path?: string,
    details?: boolean,
  ) {
    super();

    this.type = 'xunit';
    this.stats = stats;
    this.details = details;
    this.path = this.sanitizedPath(path);

    this.configureEmitter(emitter);

    logger.debug(`Using '${this.type}' reporter.`);
  }

  updateSuiteStats(
    path: string,
    stats: ReporterStats,
    callback: () => void,
  ): void {
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
  }

  cdata(str: string): string {
    return `<![CDATA[${str}]]>`;
  }

  appendLine(path: string, line: string): void {
    fs.appendFileSync(path, `${line}\n`);
  }

  toTag(
    name: string,
    attrs: Record<string, string | number> | null,
    close: boolean,
    content?: string,
  ): string {
    const end = close ? '/>' : '>';
    const pairs: string[] = [];
    if (attrs) {
      Object.keys(attrs).forEach((key) => pairs.push(`${key}="${attrs[key]}"`));
    }
    let tag = `<${name}${pairs.length ? ` ${pairs.join(' ')}` : ''}${end}`;
    if (content) {
      tag += `${content}</${name}${end}`;
    }
    return tag;
  }

  sanitizedPath(path = './report.xml'): string {
    const filePath = pathmodule.resolve(expandTilde(path));
    if (fs.existsSync(filePath)) {
      logger.warn(`File exists at ${filePath}, will be overwritten...`);
      fs.unlinkSync(filePath);
    }
    return filePath;
  }

  configureEmitter(emitter: EventEmitter): void {
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
  }
}

export default XUnitReporter;
