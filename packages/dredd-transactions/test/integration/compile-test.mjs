import esmock from 'esmock';

import createAnnotationSchema from '../schemas/createAnnotationSchema.js';
import createCompileResultSchema from '../schemas/createCompileResultSchema.js';

import { assert, fixtures } from '../support.mjs';
import compile from '../../compile/index.js';

describe('compile() · all API description formats', () => {
  describe('ordinary, valid API description', () => {
    fixtures('ordinary').forEachDescribe(({ mediaType, apiElements }) => {
      const filename = 'apiDescription.ext';
      const compileResult = compile(mediaType, apiElements, filename);

      it('is compiled into a compile result of expected structure', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({ filename }));
      });
    });
  });

  describe('causing an error in the parser', () => {
    fixtures('parser-error').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one annotation and no transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: 1,
          transactions: 0,
        }));
      });
      it('produces error from parser', () => {
        assert.jsonSchema(compileResult.annotations[0], createAnnotationSchema({
          type: 'error',
          component: 'apiDescriptionParser',
        }));
      });
    });
  });

  describe('causing an error in URI expansion', () => {
    // Parsers may provide warning in similar situations, however, we do not
    // want to rely on them (implementations differ). This error is returned
    // in case Dredd Transactions are not able to parse the URI template.
    // Mind that situations when parser gives the warning and when this error
    // is thrown can differ and also the severity is different.
    fixtures('uri-expansion-annotation').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces some annotations and no transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: [1, 3],
          transactions: 0,
        }));
      });

      it('produces maximum of two warnings from parser and exactly one error from URI expansion', () => {
        const warning = createAnnotationSchema({
          type: 'warning',
          component: 'apiDescriptionParser',
        });
        const error = createAnnotationSchema({
          type: 'error',
          component: 'uriTemplateExpansion',
          message: /failed to parse uri template/i,
        });

        assert.jsonSchema(compileResult.annotations, {
          oneOf: [
            // warning 1: "URI template variable ''"
            // warning 2: 'URI Template expression is missing closing bracket }'
            { type: 'array', items: [warning, warning, error] },
            { type: 'array', items: [error] },
          ],
        });
      });
    });
  });

  describe('causing an error in URI parameters validation', () => {
    // Parsers may provide warning in similar situations, however, we do not
    // want to rely on them (implementations differ). This error is returned
    // in case Dredd Transactions are not satisfied with the input for
    // expanding the URI template. Mind that situations when parser gives
    // the warning and when this error is returned can differ and also
    // the severity is different.
    fixtures('uri-validation-annotation').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces some annotations and no transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: [2, 3],
          transactions: 0,
        }));
      });
      it('produces maximum one warning from parser, exactly one warning from URI expansion, and exactly one error from URI parameters validation', () => {
        const parserWarning = createAnnotationSchema({
          type: 'warning',
          component: 'apiDescriptionParser',
        });
        const uriExpansionWarning = createAnnotationSchema({
          type: 'warning',
          component: 'uriTemplateExpansion',
        });
        const uriValidationError = createAnnotationSchema({
          type: 'error',
          component: 'parametersValidation',
          message: 'no example',
        });

        assert.jsonSchema(compileResult.annotations, {
          oneOf: [
            { type: 'array', items: [parserWarning, uriValidationError, uriExpansionWarning] },
            { type: 'array', items: [uriValidationError, uriExpansionWarning] },
          ],
        });
      });
    });
  });

  describe('causing a warning in the parser', () => {
    fixtures('parser-warning').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces some annotations and one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: [1],
          transactions: 1,
        }));
      });

      context('the annotations', () => {
        it('are warnings', () => {
          compileResult.annotations
            .map((ann) => assert.equal(ann.type, 'warning'));
        });
        it('come from parser', () => {
          compileResult.annotations
            .map((ann) => assert.equal(ann.component, 'apiDescriptionParser'));
        });
      });
    });
  });

  describe('causing a warning in URI expansion', () => {
    // This is a test for an arbitrary warning coming from URI expansion, which
    // doesn't have any other special side effect. Since there are no such
    // warnings as of now (but were in the past and could be in the future),
    // we need to pretend it's possible in this test.
    fixtures('ordinary').forEachDescribe(({ mediaType, apiElements }) => {
      const message = '... dummy warning message ...';
      let compileResult;
      before(async () => {
        const stubbedCompileURI = await esmock('../../compile/compileURI/index.js', {
          '../../compile/compileURI/expandURItemplate.js': {
            default: () => ({ uri: '/honey?beekeeper=Honza', errors: [], warnings: [message] }),
          },
        });
        const stubbedCompile = await esmock('../../compile/index.js', {
          '../../compile/compileURI/index.js': stubbedCompileURI,
        });
        compileResult = stubbedCompile.default(mediaType, apiElements);
      });

      it('produces some annotations', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: [1],
        }));
      });
      it('produces warnings from URI expansion', () => {
        assert.jsonSchema(compileResult.annotations, {
          type: 'array',
          items: createAnnotationSchema({
            type: 'warning',
            component: 'uriTemplateExpansion',
            message,
          }),
        });
      });
    });
  });

  describe('causing an \'ambiguous parameters\' warning in URI expansion', () => {
    // Parsers may provide error in similar situations, however, we do not
    // want to rely on them (implementations differ). This warning is returned
    // in case parameters do not have any kind of value Dredd could use. Mind
    // that situations when parser gives the error and when this warning is
    // returned can differ and also the severity is different.
    //
    // Special side effect of the warning is that affected transactions
    // should be skipped (shouldn't appear in output of the compilation).
    fixtures('ambiguous-parameters-annotation').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces two annotations and no transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: 2,
          transactions: 0,
        }));
      });
      it('produces one warning from URI expansion and one error from URI parameters validation', () => {
        assert.jsonSchema(compileResult.annotations, {
          type: 'array',
          items: [
            createAnnotationSchema({ type: 'error', component: 'parametersValidation' }),
            createAnnotationSchema({ type: 'warning', component: 'uriTemplateExpansion' }),
          ],
        });
      });
    });
  });

  describe('with dotted query parameters', () => {
    fixtures('dotted-query-parameters').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces no annotations and one transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: 0,
          transactions: 1,
        }));
      });
    });
  });

  describe('causing a warning in URI parameters validation', () => {
    // Since 'validateParams' doesn't actually return any warnings
    // (but could in the future), we need to pretend it's possible for this
    // test.
    fixtures('ordinary').forEachDescribe(({ mediaType, apiElements }) => {
      const message = '... dummy warning message ...';
      let compileResult;
      before(async () => {
        const stubbedCompileURI = await esmock('../../compile/compileURI/index.js', {
          '../../compile/compileURI/validateParams.js': {
            default: () => ({ errors: [], warnings: [message] }),
          },
        });
        const stubbedCompile = await esmock('../../compile/index.js', {
          '../../compile/compileURI/index.js': stubbedCompileURI,
        });
        compileResult = stubbedCompile.default(mediaType, apiElements);
      });

      it('produces some annotations', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          annotations: [1],
        }));
      });
      it('produces warnings from URI parameters validation', () => {
        assert.jsonSchema(compileResult.annotations, {
          type: 'array',
          items: createAnnotationSchema({
            type: 'warning',
            component: 'parametersValidation',
            message,
          }),
        });
      });
    });
  });

  describe('with enum parameter', () => {
    fixtures('enum-parameter').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 1,
        }));
      });
      it('expands the request URI with the first enum value', () => {
        assert.equal(compileResult.transactions[0].request.uri, '/honey?beekeeper=Adam');
      });
    });
  });

  describe('with enum parameter having example value', () => {
    fixtures('enum-parameter-example').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 1,
        }));
      });
      it('expands the request URI with the example value', () => {
        assert.equal(compileResult.transactions[0].request.uri, '/honey?beekeeper=Honza');
      });
    });
  });

  describe('with parameters having example values', () => {
    fixtures('example-parameters').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 1,
        }));
      });
      it('expands the request URI with the example value', () => {
        assert.equal(compileResult.transactions[0].request.uri, '/honey?beekeeper=Honza&flavour=spicy');
      });
    });
  });

  describe('with inheritance of URI parameters', () => {
    fixtures('parameters-inheritance').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 1,
        }));
      });
      it('expands the request URI using correct inheritance cascade', () => {
        assert.equal(compileResult.transactions[0].request.uri, '/honey?beekeeper=Honza&amount=42');
      });
    });
  });

  describe('with HTTP headers', () => {
    fixtures('http-headers').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces one transaction', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 1,
        }));
      });
      it('produces expected request headers', () => {
        assert.deepEqual(compileResult.transactions[0].request.headers, [
          { name: 'Accept', value: 'application/json' },
          { name: 'Content-Type', value: 'application/json' },
        ]);
      });
      it('produces expected response headers', () => {
        // OpenAPI 3 (parser 0.16.1) does not derive a value for a response
        // header declared without a supported value source, so 'X-Test' is
        // emitted with an empty value.
        assert.deepEqual(compileResult.transactions[0].response.headers, [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Test', value: '' },
        ]);
      });
    });
  });

  describe('without explicit body', () => {
    fixtures('no-body').forEachDescribe(({ mediaType, apiElements }) => {
      const compileResult = compile(mediaType, apiElements);

      it('produces 2 transactions', () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: 2,
        }));
      });
      it('produces transaction #1 with no body', () => {
        assert.isUndefined(compileResult.transactions[0].response.body);
      });
      it('produces transaction #2 with no body', () => {
        assert.isUndefined(compileResult.transactions[0].response.body);
      });
    });
  });

  describe('without explicit schema', () => {
    fixtures('no-schema').forEachDescribe(({ mediaType, apiElements }) => {
      const expectedContentTypes = ['application/json', 'application/json', 'text/csv', 'text/yaml'];
      const compileResult = compile(mediaType, apiElements);

      it(`produces ${expectedContentTypes.length} transactions`, () => {
        assert.jsonSchema(compileResult, createCompileResultSchema({
          transactions: expectedContentTypes.length,
        }));
      });
      expectedContentTypes.forEach((contentType, i) => context(`transaction #${i + 1}`, () => {
        it(`has '${contentType}' response`, () => {
          assert.deepEqual(compileResult.transactions[i].response.headers, [
            { name: 'Content-Type', value: contentType },
          ]);
        });
        it('has no schema', () => {
          assert.isUndefined(compileResult.transactions[i].response.schema);
        });
      }));
    });
  });
});
