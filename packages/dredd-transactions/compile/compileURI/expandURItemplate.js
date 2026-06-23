// Named import: uri-template marks itself `__esModule` but exposes no default
// export, so a default import resolves to `undefined` under esbuild/tsx (which
// honours `__esModule`) even though it works under plain Node.
import { parse as parseUriTemplate } from 'uri-template';

export default function expandURITemplate(uriTemplate, params) {
  let parsed;
  const result = {
    errors: [],
    warnings: [],
    uri: null,
  };

  try {
    parsed = parseUriTemplate(uriTemplate);
  } catch (e) {
    result.errors.push(`\
Failed to parse URI template: ${uriTemplate}
Error: ${e}\
`);
    return result;
  }

  // Get parameters from the parsed template's expression parts
  const expressions = parsed.ast.parts.filter(
    (part) => part.type === 'expression'
  );
  const uriParameters = expressions
    .map((expression) => expression.variables.map((variable) => variable.name))
    .reduce((accumulator, current) => accumulator.concat(current), [])
    .map(decodeURI);

  if (expressions.length === 0) {
    result.uri = uriTemplate;
  } else {
    let ambiguous = false;

    uriParameters.forEach((uriParameter) => {
      if (Object.keys(params).indexOf(uriParameter) === -1) {
        ambiguous = true;
        result.warnings.push(`\
Ambiguous URI parameter in template: ${uriTemplate}
Parameter not defined in API description document: ${uriParameter}\
`);
      }
    });

    let param;
    const toExpand = {};

    if (!ambiguous) {
      uriParameters.forEach((uriParameter) => {
        param = params[uriParameter];

        if (typeof param.example !== 'undefined' && param.example !== '') {
          toExpand[uriParameter] = param.example;
        } else if (typeof param.default !== 'undefined' && param.default !== '') {
          toExpand[uriParameter] = param.default;
        } else if (param.required) {
          ambiguous = true;
          result.warnings.push(`\
Ambiguous URI parameter in template: ${uriTemplate}
No example value for required parameter in API description \
document: ${uriParameter}\
`);
        }

        if (param.required && typeof param.default !== 'undefined' && param.default !== '') {
          result.warnings.push(`\
Required URI parameter '${uriParameter}' has a default value.
Default value for a required parameter doesn't make sense from \
API description perspective. Use example value instead.\
`);
        }
      });
    }

    if (!ambiguous) {
      result.uri = parsed.expand(toExpand);
    }
  }

  return result;
};
