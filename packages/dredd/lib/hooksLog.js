// @ts-check
import util from 'util';

/**
 * @param {Array<{ timestamp: number, content: string }>} logs
 * @param {{ hook?: (content: any) => void } | undefined} logger
 * @param {*} content
 */
export default function hooksLog(logs = [], logger, content) {
  // Log to logger
  if (logger && typeof logger.hook === 'function') {
    logger.hook(content);
  }

  // Append to array of logs to allow further operations, e.g. send all hooks logs to Apiary
  logs.push({
    timestamp: Date.now(),
    content: typeof content === 'object' ? util.format(content) : `${content}`,
  });

  return logs;
}
