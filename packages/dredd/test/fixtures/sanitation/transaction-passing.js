const hooks = require('hooks');

hooks.after('/resource > Update Resource > 200 > application/json; charset=utf-8', (transaction, done) => {
  transaction.test.request.body = '';
  done();
});
