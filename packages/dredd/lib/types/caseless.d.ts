// Ambient declaration for the `caseless` package, which ships no types and has
// no `@types/caseless` on npm. Dredd uses it to find a header by its
// case-insensitive name. Only the surface Dredd touches is declared.
declare module 'caseless' {
  interface Caseless {
    set(name: string, value: unknown, clobber?: boolean): boolean;
    /** Returns the actual matching key, or `false` when absent. */
    has(name: string): string | false;
    get(name: string): unknown;
    swap(name: string): void;
    del(name: string): boolean;
  }
  function caseless(dict?: Record<string, unknown>): Caseless;
  export = caseless;
}
