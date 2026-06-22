// @ts-check
import createConsoleLogger from './createConsoleLogger';

const logger = createConsoleLogger({
  levels: {
    debug: 2,
    warn: 1,
    error: 0,
  },
  colors: {
    debug: 'cyan',
    warn: 'yellow',
    error: 'red',
  },
  level: 'warn',
  // Diagnostics go to stderr; warnings stay on stdout (matching Winston 2.x
  // Dredd) so they don't get mixed with piped reporter output on stderr.
  stderr: ['debug', 'error'],
});

export default logger;
