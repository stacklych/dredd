import type { EventEmitter } from 'events';

import BaseReporter from './reporters/BaseReporter.js';
import CLIReporter from './reporters/CLIReporter.js';
import DotReporter from './reporters/DotReporter.js';
import HTMLReporter from './reporters/HTMLReporter.js';
import JSONReporter from './reporters/JSONReporter.js';
import MarkdownReporter from './reporters/MarkdownReporter.js';
import NyanCatReporter from './reporters/NyanReporter.js';
import XUnitReporter from './reporters/XUnitReporter.js';

import logger from './logger.js';
import type { ReporterStats } from './types/reporters.js';

type ConfigureStats = ReporterStats & {
  fileBasedReporters?: number;
};

interface ReportersConfig {
  emitter: EventEmitter;
  reporter: string[];
  output: string[];
  details: boolean;
  'inline-errors': boolean;
  server?: string;
  custom?: Record<string, any>;
  http?: Record<string, any>;
}

const fileReporters = ['xunit', 'html', 'json', 'markdown'];

const cliReporters = ['dot', 'nyan'];

function intersection(a: string[], b: string[]): string[] {
  if (a.length > b.length) {
    [a, b] = Array.from([b, a]);
  }
  return Array.from(a).filter((value) => Array.from(b).includes(value));
}

function configureReporters(config: ReportersConfig, stats: ConfigureStats) {
  addReporter('base', config.emitter, stats);

  const reporters = config.reporter;
  const outputs = config.output;

  logger.debug('Configuring reporters:', reporters, outputs);

  function addCli(reportersArr: string[]) {
    if (reportersArr.length > 0) {
      const usedCliReporters = intersection(reportersArr, cliReporters);
      if (usedCliReporters.length === 0) {
        return new CLIReporter(
          config.emitter,
          stats,
          config['inline-errors'],
          config.details,
        );
      }
      return addReporter(usedCliReporters[0], config.emitter, stats);
    }
    return new CLIReporter(
      config.emitter,
      stats,
      config['inline-errors'],
      config.details,
    );
  }

  function addReporter(
    reporter: string,
    emitter: EventEmitter,
    statistics: ConfigureStats,
    path?: string,
  ) {
    switch (reporter) {
      case 'xunit':
        return new XUnitReporter(emitter, statistics, path, config.details);
      case 'dot':
        return new DotReporter(emitter, statistics);
      case 'nyan':
        return new NyanCatReporter(emitter, statistics);
      case 'html':
        return new HTMLReporter(emitter, statistics, path, config.details);
      case 'json':
        return new JSONReporter(emitter, statistics, path, config.details);
      case 'markdown':
        return new MarkdownReporter(emitter, statistics, path, config.details);
      default:
        // I don't even know where to begin...
        // TODO: DESIGN / REFACTOR WHOLE REPORTER(S) API FROM SCRATCH, THIS IS MADNESS!!1
        return new BaseReporter(emitter, statistics);
    }
  }

  addCli(reporters);

  const usedFileReporters = intersection(reporters, fileReporters);

  stats.fileBasedReporters = usedFileReporters.length;

  if (usedFileReporters.length > 0) {
    if (usedFileReporters.length > outputs.length) {
      logger.warn(`
There are more reporters requiring output paths than there are output paths
provided. Using default paths for additional file-based reporters.
`);
    }

    return usedFileReporters.map((usedFileReporter, index) => {
      const path = outputs[index] ? outputs[index] : undefined;
      return addReporter(usedFileReporter, config.emitter, stats, path);
    });
  }
}

export default configureReporters;
