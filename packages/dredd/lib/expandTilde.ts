import os from 'os';

const homeDirectory = os.homedir();

// Expands a leading '~' (followed by a path separator or the end of the
// string) to the user's home directory. Local replacement for the
// 'untildify' package, which is ESM-only from v5 onwards.
export default function expandTilde(pathWithTilde: string): string {
  if (typeof pathWithTilde !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof pathWithTilde}`);
  }

  return homeDirectory
    ? pathWithTilde.replace(/^~(?=$|\/|\\)/, homeDirectory)
    : pathWithTilde;
}
