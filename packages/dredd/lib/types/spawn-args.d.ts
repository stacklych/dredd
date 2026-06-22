// `spawn-args` (no @types on npm) parses a command-line string into an array
// of argument tokens. Dredd uses it to split the configured `server` command
// into a command plus its arguments.
declare module 'spawn-args' {
  function spawnArgs(args: string, opts?: { removequotes?: string }): string[];
  export = spawnArgs;
}
