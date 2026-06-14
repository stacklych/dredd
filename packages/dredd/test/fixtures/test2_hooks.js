const hooks = require('hooks');

hooks.before(
  '/machines > Get Machines > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    transaction.request.headers.header = '123232323';
    console.log('before');
    done();
  },
);
