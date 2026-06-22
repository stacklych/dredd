const hooks = require('hooks');

hooks.after(
  '/resource > PUT > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    transaction.test.request.body = '';
    done();
  },
);
