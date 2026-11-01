// Ambient declaration for the `cross-spawn` package (v7), which ships no types
// and has no `@types/cross-spawn` on npm. Dredd uses `crossSpawn.spawn` and
// `crossSpawn.sync`, cross-platform replacements for `child_process.spawn`
// and `child_process.spawnSync`.
declare module 'cross-spawn' {
  import {
    ChildProcess,
    SpawnOptions,
    SpawnSyncOptionsWithStringEncoding,
    SpawnSyncReturns,
  } from 'child_process';

  function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): ChildProcess;

  namespace spawn {
    function spawn(
      command: string,
      args?: readonly string[],
      options?: SpawnOptions,
    ): ChildProcess;

    function sync(
      command: string,
      args?: readonly string[],
      options?: SpawnSyncOptionsWithStringEncoding,
    ): SpawnSyncReturns<string>;
  }

  export = spawn;
}
