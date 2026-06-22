const hooks = require('hooks');

hooks.after(
  '/resource > Update Resource > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    try {
      JSON.parse('💥 boom 💥');
    } catch (error) {
      transaction.fail = 'Unexpected exception in hooks';
      transaction.test = {
        start: transaction.test.start,
        end: transaction.test.end,
        duration: transaction.test.duration,
        startedAt: transaction.test.startedAt,
        message: transaction.fail,
      };
    }
    done();
  },
);
