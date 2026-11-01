// Lets the reporters import the package manifest for its version string
// without enabling `resolveJsonModule` (the manifest lives outside the
// compiler's rootDir, which that option doesn't allow). Only `name` and
// `version` are relied upon.
declare module '*/package.json' {
  const pkg: { name: string; version: string; [key: string]: unknown };
  export default pkg;
}
