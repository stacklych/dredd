import compileTransactionName from './compileTransactionName';

/**
 * Turns annotation type into a log level
 */
function typeToLogLevel(annotationType: string): string {
  const levels: Record<string, string> = { error: 'error', warning: 'warn' };
  const level = levels[annotationType];
  if (!level) {
    throw new Error(`Invalid annotation type: '${annotationType}'`);
  }
  return level;
}

/**
 * Takes a component identifier and turns it into something user can understand
 */
function formatComponent(component: string): string {
  switch (component) {
    case 'apiDescriptionParser':
      return 'API description parser';
    case 'parametersValidation':
      return 'API description URI parameters validation';
    case 'uriTemplateExpansion':
      return 'API description URI template expansion';
    default:
      return 'API description';
  }
}

/**
 * Formats given location data as something user can understand
 *
 * @param apiDescriptionLocation API description location name
 * @param annotationLocation See 'dredd-transactions' docs
 */
function formatLocation(
  apiDescriptionLocation: string,
  annotationLocation?: number[][],
): string {
  if (!annotationLocation) {
    return apiDescriptionLocation;
  }

  const [[startLine, startColumn], [endLine, endColumn]] = annotationLocation;
  const editorLink = `${apiDescriptionLocation}:${startLine}`;
  const from = `line ${startLine} column ${startColumn}`;

  if (startLine === endLine && startColumn === endColumn) {
    return `${editorLink} (${from})`;
  }

  const to =
    startLine === endLine
      ? `column ${endColumn}`
      : `line ${endLine} column ${endColumn}`;
  return `${editorLink} (from ${from} to ${to})`;
}

/** A plain object winston.log() accepts as input */
interface LoggerInfo {
  level: string;
  message: string;
}

/** The annotation object from Dredd Transactions */
interface Annotation {
  type: string;
  component: string;
  message: string;
  location?: number[][];
  /** Present on compiler annotations (used in the non-parser branch) */
  origin?: {
    apiName?: string;
    resourceGroupName?: string;
    resourceName?: string;
    actionName?: string;
    exampleName?: string;
  };
}

/**
 * Takes API description parser or compiler annotation returned from
 * the 'dredd-transactions' library and transforms it into a message
 * Dredd can show to the user. Returns an object logger accepts as input.
 *
 * @param apiDescriptionLocation API description location name
 * @param annotation the annotation object from Dredd Transactions
 */
export default function annotationToLoggerInfo(
  apiDescriptionLocation: string,
  annotation: Annotation,
): LoggerInfo {
  const level = typeToLogLevel(annotation.type);

  if (annotation.component === 'apiDescriptionParser') {
    const message =
      `${formatComponent(annotation.component)} ${annotation.type}` +
      ` in ${formatLocation(apiDescriptionLocation, annotation.location)}:` +
      ` ${annotation.message}`;
    return { level, message };
  }

  // See https://github.com/apiaryio/dredd-transactions/issues/275 why this
  // is handled in a different way than parser annotations
  const message =
    `${formatComponent(annotation.component)} ${annotation.type}` +
    ` in ${apiDescriptionLocation} (${compileTransactionName(
      annotation.origin as NonNullable<Annotation['origin']>,
    )}):` +
    ` ${annotation.message}`;
  return { level, message };
}
