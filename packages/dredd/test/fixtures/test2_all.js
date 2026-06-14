const hooks = require('hooks');

hooks.beforeAll((done) => {
  console.log('*** beforeAll');
  done();
});

hooks.before(
  '/machines > Get Machines > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    console.log('*** before');
    done();
  },
);
