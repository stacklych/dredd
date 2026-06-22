// @ts-check
import compileTransactionName from './compileTransactionName';

/**
 * Turns annotation type into a log level
 * @param {string} annotationType
 * @returns {string}
 */
function typeToLogLevel(annotationType) {
  /** @type {Record<string, string>} */
  const levels = { error: 'error', warning: 'warn' };
  const level = levels[annotationType];
  if (!level) {
    throw new Error(`Invalid annotation type: '${annotationType}'`);
  }
  return level;
}

/**
 * Takes a component identifier and turns it into something user can understand
 *
 * @param {string} component
 * @returns {string}
 */
function formatComponent(component) {
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
 * @param {string} apiDescriptionLocation API description location name
 * @param {number[][]} [annotationLocation] See 'dredd-transactions' docs
 * @returns {string}
 */
function formatLocation(apiDescriptionLocation, annotationLocation) {
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

/**
 * @typedef {Object} LoggerInfo A plain object winston.log() accepts as input
 * @property {string} level
 * @property {string} message
 */

/**
 * @typedef {Object} Annotation The annotation object from Dredd Transactions
 * @property {string} type
 * @property {string} component
 * @property {string} message
 * @property {number[][]} [location]
 * @property {{
 *   apiName?: string,
 *   resourceGroupName?: string,
 *   resourceName?: string,
 *   actionName?: string,
 *   exampleName?: string,
 * }} [origin] Present on compiler annotations (used in the non-parser branch)
 */

/**
 * Takes API description parser or compiler annotation returned from
 * the 'dredd-transactions' library and transforms it into a message
 * Dredd can show to the user. Returns an object logger accepts as input.
 *
 * @param {string} apiDescriptionLocation API description location name
 * @param {Annotation} annotation the annotation object from Dredd Transactions
 * @return {LoggerInfo}
 */
export default function annotationToLoggerInfo(
  apiDescriptionLocation,
  annotation,
) {
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
      /** @type {NonNullable<Annotation['origin']>} */ (annotation.origin),
    )}):` +
    ` ${annotation.message}`;
  return { level, message };
}
