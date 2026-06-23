import logger from '../logger';
import reporterOutputLogger from '../reporters/reporterOutputLogger';

/**
 * Applies logging options from the given configuration.
 * Operates on the validated normalized config.
 *
 * @param config The validated, normalized Dredd config (a dynamic bag with no
 *   canonical type until `normalizeConfig` is type-checked).
 */
function applyLoggingOptions(config: any): void {
  if (config.color === false) {
    logger.transports.console.colorize = false;
    reporterOutputLogger.transports.console.colorize = false;
  }

  // TODO https://github.com/apiaryio/dredd/issues/1346
  if (config.loglevel) {
    const loglevel = config.loglevel.toLowerCase();
    if (loglevel === 'silent') {
      logger.transports.console.silent = true;
    } else if (loglevel === 'warning') {
      logger.transports.console.level = 'warn';
    } else if (loglevel === 'debug') {
      logger.transports.console.level = 'debug';
      logger.transports.console.timestamp = true;
    } else if (['warn', 'error'].includes(loglevel)) {
      logger.transports.console.level = loglevel;
    } else {
      logger.transports.console.level = 'warn';
      throw new Error(
        `The logging level '${loglevel}' is unsupported, ` +
          'supported are: silent, error, warning, debug',
      );
    }
  } else {
    logger.transports.console.level = 'warn';
  }
}

export default applyLoggingOptions;
