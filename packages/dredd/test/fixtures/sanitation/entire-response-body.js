const hooks = require('hooks');

hooks.after(
  '/resource > Update Resource > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    transaction.test.actual.body = '';
    transaction.test.expected.body = '';
    transaction.test.expected.bodySchema = '';

    transaction.test.message = '';
    delete transaction.test.results.fields.body;
    done();
  },
);
