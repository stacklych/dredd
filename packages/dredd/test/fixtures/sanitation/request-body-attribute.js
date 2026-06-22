const hooks = require('hooks');

hooks.after(
  '/resource > Update Resource > 200 > application/json',
  (transaction, done) => {
    const body = JSON.parse(transaction.test.request.body);
    delete body.token;
    transaction.test.request.body = JSON.stringify(body);
    done();
  },
);
