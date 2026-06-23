interface ConfigRule {
  /** Config keys this rule matches */
  options: string[];
  /** Warning/error message to surface */
  message: string;
}

const deprecatedOptions: ConfigRule[] = [
  {
    options: ['c'],
    message:
      'DEPRECATED: The -c configuration option is deprecated. Plese use --color instead.',
  },
  {
    options: ['data'],
    message:
      'DEPRECATED: The --data configuration option is deprecated ' +
      'in favor of `apiDescriptions`, please see https://dredd.org',
  },
  {
    options: ['blueprintPath'],
    message:
      'DEPRECATED: The --blueprintPath configuration option is deprecated, ' +
      'please use --path instead.',
  },
  {
    options: ['level'],
    message:
      'DEPRECATED: The --level configuration option is deprecated. Please use --loglevel instead.',
  },
];

const unsupportedOptions: ConfigRule[] = [
  {
    options: ['timestamp', 't'],
    message:
      'REMOVED: The --timestamp/-t configuration option is no longer supported. Please use --loglevel=debug instead.',
  },
  {
    options: ['silent', 'q'],
    message:
      'REMOVED: The --silent/-q configuration option is no longer supported. Please use --loglevel=silent instead.',
  },
  {
    options: ['sandbox', 'b'],
    message:
      'REMOVED: Dredd does not support sandboxed JS hooks anymore, use standard JS hooks instead.',
  },
  {
    options: ['hooksData'],
    message:
      'REMOVED: Dredd does not support sandboxed JS hooks anymore, use standard JS hooks instead.',
  },
];

function flushMessages(
  rules: ConfigRule[],
  config: Record<string, unknown>,
): string[] {
  return Object.keys(config).reduce((messages, configKey) => {
    const warning = rules.find((rule) => rule.options.includes(configKey));
    return warning ? messages.concat(warning.message) : messages;
  }, [] as string[]);
}

/**
 * Returns the errors and warnings relative to the given config.
 */
const validateConfig = (
  config: Record<string, unknown>,
): { warnings: string[]; errors: string[] } => ({
  warnings: flushMessages(deprecatedOptions, config),
  errors: flushMessages(unsupportedOptions, config),
});

export default validateConfig;
