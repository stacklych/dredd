import util from 'util';

interface HookLogEntry {
  timestamp: number;
  content: string;
}

export default function hooksLog(
  logs: HookLogEntry[] = [],
  logger: { hook?: (content: any) => void } | undefined,
  content: any,
): HookLogEntry[] {
  // Log to logger
  if (logger && typeof logger.hook === 'function') {
    logger.hook(content);
  }

  // Append to array of logs to allow further operations, e.g. surface all
  // hooks logs to reporters
  logs.push({
    timestamp: Date.now(),
    content: typeof content === 'object' ? util.format(content) : `${content}`,
  });

  return logs;
}
