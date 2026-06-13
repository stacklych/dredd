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
});

export default logger;
