import util from 'util';
import winston from 'winston';

// Reproduces Winston 2.x's metadata serialization (its lib/winston/common.js
// `serialize`) so that upgrading to Winston 3.x keeps the console output
// byte-for-byte identical.
function serialize(obj, key) {
  if (typeof key === 'symbol') {
    key = key.toString();
  }
  if (typeof obj === 'symbol') {
    obj = obj.toString();
  }

  if (obj === null) {
    obj = 'null';
  } else if (obj === undefined) {
    obj = 'undefined';
  } else if (obj === false) {
    obj = 'false';
  }

  if (typeof obj !== 'object') {
    return key ? `${key}=${obj}` : obj;
  }

  if (obj instanceof Buffer) {
    return key ? `${key}=${obj.toString('base64')}` : obj.toString('base64');
  }

  let msg = '';
  const keys = Object.keys(obj);
  const { length } = keys;

  for (let i = 0; i < length; i += 1) {
    if (Array.isArray(obj[keys[i]])) {
      msg += `${keys[i]}=[`;
      for (let j = 0, l = obj[keys[i]].length; j < l; j += 1) {
        msg += serialize(obj[keys[i]][j]);
        if (j < l - 1) {
          msg += ', ';
        }
      }
      msg += ']';
    } else if (obj[keys[i]] instanceof Date) {
      msg += `${keys[i]}=${obj[keys[i]]}`;
    } else {
      msg += serialize(obj[keys[i]], keys[i]);
    }

    if (i < length - 1) {
      msg += ', ';
    }
  }

  return msg;
}

// Winston 2.x level methods accepted printf-style arguments plus an optional
// trailing metadata object; Winston 3.x does not. Assemble the message the old
// way so the wrapped level methods stay backwards compatible.
function assembleMessage(args) {
  const rest = args.slice();
  let meta;
  if (
    rest.length > 1 &&
    rest[rest.length - 1] !== null &&
    typeof rest[rest.length - 1] === 'object'
  ) {
    meta = rest.pop();
  }

  let message = util.format(...rest);

  if (meta !== null && meta !== undefined) {
    let resolved = meta;
    if (resolved instanceof Error && resolved.stack) {
      resolved = resolved.stack;
    }

    if (typeof resolved !== 'object') {
      message += ` ${resolved}`;
    } else if (Object.keys(resolved).length > 0) {
      message += ` ${serialize(resolved)}`;
    }
  }

  return message;
}

// ANSI foreground codes matching the colors Winston 2.x emitted (reset is 39).
const ANSI_COLORS = {
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
};

function colorizeLevel(level, colorName) {
  const code = ANSI_COLORS[colorName];
  return code ? `\x1b[${code}m${level}\x1b[39m` : level;
}

// Builds a Winston 3.x logger that behaves like the Winston 2.x loggers Dredd
// relied on: a single Console transport whose `colorize`, `timestamp`, `silent`
// and `level` flags can be toggled at runtime via `logger.transports.console`.
export default function createConsoleLogger({ levels, colors, level }) {
  const consoleTransport = new winston.transports.Console({ level });
  consoleTransport.colorize = true;
  consoleTransport.timestamp = false;
  consoleTransport.format = winston.format.printf((info) => {
    const renderedLevel = consoleTransport.colorize
      ? colorizeLevel(info.level, colors[info.level])
      : info.level;
    const timestamp = consoleTransport.timestamp
      ? `${new Date().toISOString()} - `
      : '';
    return `${timestamp}${renderedLevel}: ${info.message}`;
  });

  const logger = winston.createLogger({
    levels,
    transports: [consoleTransport],
  });

  Object.keys(levels).forEach((levelName) => {
    logger[levelName] = (...args) =>
      logger.log(levelName, assembleMessage(args));
  });

  // Winston 3.x recomputes `logger.transports` as a fresh array on each access,
  // so a plain assignment of a `console` property would not persist. Shadow the
  // getter with a stable array that also exposes the transport as `.console`,
  // preserving the `logger.transports.console` contract used by configuration
  // and tests. Logging goes through the underlying stream, not this property,
  // so shadowing it is safe.
  Object.defineProperty(logger, 'transports', {
    value: Object.assign([consoleTransport], { console: consoleTransport }),
    writable: true,
    configurable: true,
  });

  return logger;
}
