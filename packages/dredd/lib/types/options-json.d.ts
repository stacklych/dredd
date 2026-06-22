// Lets CLI.js import options.json (the CLI option definitions) without
// enabling `resolveJsonModule` (the file lives outside the compiler's rootDir,
// which that option doesn't allow). Mirrors the package.json ambient decl.
declare module '*/options.json' {
  interface DreddOption {
    alias?: string;
    description?: string;
    default?: unknown;
    boolean?: boolean;
  }
  const options: Record<string, DreddOption>;
  export default options;
}
