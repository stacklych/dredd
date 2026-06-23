import compileUri from './compileURI/index.js';
import compileTransactionName from './compileTransactionName.js';
import compileAnnotation from './compileAnnotation.js';
import compileOpenAPI31 from './openapi31.js';
import augmentWithOpenAPI30Schemas from './openapi30Schema.js';

function findRelevantTransactions(apiElements) {
  const relevantTransactions = [];
  apiElements.findRecursive('resource', 'transition').forEach((transitionElement) => {
    transitionElement.transactions.forEach((httpTransactionElement) => {
      relevantTransactions.push({ httpTransactionElement });
    });
  });
  return relevantTransactions;
}

function compileHeaders(httpHeadersElement) {
  if (!httpHeadersElement) { return []; }
  return httpHeadersElement.toValue().map(({ key, value }) => ({ name: key, value: value || '' }));
}

function compileOriginExampleName(httpResponseElement) {
  const statusCode = (httpResponseElement.statusCode ? httpResponseElement.statusCode.toValue() : undefined) || '200';
  const headers = compileHeaders(httpResponseElement.headers);

  const contentType = headers
    .filter((header) => header.name.toLowerCase() === 'content-type')
    .map((header) => header.value)[0];

  const segments = [];
  if (statusCode) { segments.push(statusCode); }
  if (contentType) { segments.push(contentType); }
  return segments.join(' > ');
}

function compileOrigin(filename, httpTransactionElement) {
  const apiElement = httpTransactionElement.parents.find((element) => element.classes.contains('api'));
  const resourceGroupElement = httpTransactionElement.parents.find((element) => element.classes.contains('resourceGroup'));
  const resourceElement = httpTransactionElement.parents.find('resource');
  const transitionElement = httpTransactionElement.parents.find('transition');
  const httpRequestElement = httpTransactionElement.request;
  const httpResponseElement = httpTransactionElement.response;
  return {
    filename: filename || '',
    apiName: apiElement.meta.getValue('title') || filename || '',
    resourceGroupName: (resourceGroupElement ? resourceGroupElement.meta.getValue('title') : undefined) || '',
    resourceName: resourceElement.meta.getValue('title') || resourceElement.attributes.getValue('href') || '',
    actionName: transitionElement.meta.getValue('title') || httpRequestElement.attributes.getValue('method') || '',
    exampleName: compileOriginExampleName(httpResponseElement),
  };
}

function hasMultipartBody(headers) {
  return !!headers.filter(({ name, value }) => name.toLowerCase() === 'content-type'
    && value.toLowerCase().includes('multipart')).length;
}

function compileBody(messageBodyElement, isMultipart) {
  if (!messageBodyElement) { return ''; }

  const body = messageBodyElement.toValue() || '';
  if (!isMultipart) { return body; }

  // Fixing manually written 'multipart/form-data' bodies (API Blueprint
  // issue: https://github.com/apiaryio/api-blueprint/issues/401)
  return body.replace(/\r?\n/g, '\r\n');
}

function compileRequest(httpRequestElement) {
  let request;
  const { uri, annotations } = compileUri(httpRequestElement);

  annotations.forEach((annotation) => {
    /* eslint-disable no-param-reassign */
    annotation.location = null; // https://github.com/apiaryio/dredd-transactions/issues/275
    /* eslint-enable */
  });

  if (uri) {
    const headers = compileHeaders(httpRequestElement.headers);
    request = {
      method: httpRequestElement.method.toValue(),
      uri,
      headers,
      body: compileBody(httpRequestElement.messageBody, hasMultipartBody(headers)),
    };
  } else {
    request = null;
  }

  return { request, annotations };
}

function compileResponse(httpResponseElement) {
  const status = (httpResponseElement.statusCode ? httpResponseElement.statusCode.toValue() : undefined) || '200';
  const headers = compileHeaders(httpResponseElement.headers);
  const response = { status, headers };

  const body = compileBody(httpResponseElement.messageBody, hasMultipartBody(headers));
  if (body) { response.body = body; }

  const schema = httpResponseElement.messageBodySchema
    ? httpResponseElement.messageBodySchema.toValue() : undefined;
  if (schema) { response.schema = schema; }

  return response;
}

function compileTransaction(filename, httpTransactionElement) {
  const origin = compileOrigin(filename, httpTransactionElement);
  const name = compileTransactionName(origin);

  const { request, annotations } = compileRequest(httpTransactionElement.request);
  annotations.forEach((annotation) => {
    /* eslint-disable no-param-reassign */
    annotation.name = name;
    annotation.origin = { ...origin };
    /* eslint-enable */
  });
  if (!request) { return { transaction: null, annotations }; }

  return {
    transaction: {
      request,
      response: compileResponse(httpTransactionElement.response),
      name,
      origin,
    },
    annotations,
  };
}

function compile(mediaType, apiElements, filename) {
  if (apiElements && apiElements.openapi31) {
    return compileOpenAPI31(apiElements, filename);
  }

  apiElements.freeze();

  const transactions = [];
  let annotations = apiElements.annotations.map(compileAnnotation);

  findRelevantTransactions(apiElements)
    .forEach(({ httpTransactionElement }) => {
      const result = compileTransaction(filename, httpTransactionElement);
      if (result.transaction) { transactions.push(result.transaction); }
      annotations = annotations.concat(result.annotations);
    });

  if (apiElements.openapi3Document) {
    augmentWithOpenAPI30Schemas(transactions, apiElements.openapi3Document.document);
  }

  return { mediaType, transactions, annotations };
}

// only for the purpose of unit tests
compile._compileBody = compileBody;
compile._hasMultipartBody = hasMultipartBody;

export default compile;
