const hooks = require('hooks');

const unfold = (jsonString, transform) =>
  JSON.stringify(transform(JSON.parse(jsonString)));

hooks.after(
  '/resource > PUT > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    const deleteToken = (obj) => {
      delete obj.token;
      return obj;
    };

    // Removes sensitive data from the Dredd transaction
    transaction.test.actual.body = unfold(
      transaction.test.actual.body,
      deleteToken,
    );
    transaction.test.expected.body = unfold(
      transaction.test.expected.body,
      deleteToken,
    );

    // Sanitation of the attribute in JSON Schema
    const bodySchema = JSON.parse(transaction.test.expected.bodySchema);
    delete bodySchema.properties.token;
    transaction.test.expected.bodySchema = JSON.stringify(bodySchema);

    // Removes sensitive data from the Gavel validation result. Under OpenAPI 3.1
    // the body field result carries only the 'actual' value (the expected side is
    // represented by the schema), so guard each value before sanitizing it.
    const bodyResult = transaction.test.results.fields.body;
    bodyResult.errors = bodyResult.errors.filter(
      (error) => error.location.pointer !== '/token',
    );
    if (bodyResult.values.expected) {
      bodyResult.values.expected = unfold(
        bodyResult.values.expected,
        deleteToken,
      );
    }
    if (bodyResult.values.actual) {
      bodyResult.values.actual = unfold(bodyResult.values.actual, deleteToken);
    }

    transaction.test.message = '';
    done();
  },
);
