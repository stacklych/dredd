const caseless = require('caseless');
const hooks = require('hooks');

// The OpenAPI 3 parser does not emit an 'Authorization' request header
// parameter, so inject the sensitive header here to mirror the original
// API Blueprint fixture and exercise the redaction in the 'after' hook.
hooks.before(
  '/resource > PUT > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    transaction.request.headers.Authorization =
      'token 5229c6e8e4b0bd7dbb07e29c';
    done();
  },
);

hooks.after(
  '/resource > PUT > 200 > application/json; charset=utf-8',
  (transaction, done) => {
    const headers = transaction.test.request.headers;
    const name = caseless(headers).has('Authorization');
    delete headers[name];
    transaction.test.request.headers = headers;
    done();
  },
);
