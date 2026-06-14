const hooks = require('hooks');

hooks.before('/resource > Update Resource > 200 > application/json; charset=utf-8', (transaction, done) => {
  transaction.fail = true;
  done();
});

hooks.after('/resource > Update Resource > 200 > application/json; charset=utf-8', (transaction, done) => {
  if (transaction.test && transaction.test.request) {
    transaction.test.request.body = '';
  }
  done();
});
