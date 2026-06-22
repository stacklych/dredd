// Ambient declaration for the `html` package (commonjs-html-prettyprinter),
// which ships no types and has no `@types/html` on npm. Dredd uses only
// `prettyPrint` to format HTML response bodies in the reporters.
declare module 'html' {
  interface PrettyPrintOptions {
    indent_size?: number;
    indent_char?: string;
    max_char?: number;
    unformatted?: string[];
  }
  export function prettyPrint(
    htmlSource: string,
    options?: PrettyPrintOptions,
  ): string;
}
