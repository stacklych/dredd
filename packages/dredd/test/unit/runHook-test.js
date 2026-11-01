import { assert } from 'chai';
import { EventEmitter } from 'events';

import Runner from '../../lib/TransactionRunner';

function createRunner() {
  const runner = new Runner({});
  runner.hookErrors = [];
  runner.emitHookError = (error) => runner.hookErrors.push(error);
  return runner;
}

function createTransaction() {
  return {
    name: 'T > /a > GET > 200',
    origin: {},
    request: { method: 'GET', uri: '/a', headers: {} },
    expected: {},
  };
}

// Calls back with what the runner recorded, or fails after `ms` (a hang).
function runHooks(runner, hooks, data, callback, ms = 1000) {
  const timer = setTimeout(
    () => callback(new Error('runHooksForData never called back')),
    ms,
  );
  runner.runHooksForData(hooks, data, () => {
    clearTimeout(timer);
    callback(null);
  });
}

describe('TransactionRunner.runHooksForData() hook styles', () => {
  it('finishes a hook that declares no parameters', (done) => {
    const runner = createRunner();
    let ran = false;
    runHooks(
      runner,
      [
        () => {
          ran = true;
        },
      ],
      createTransaction(),
      (err) => {
        assert.isTrue(ran);
        done(err);
      },
    );
  });

  it('finishes a synchronous one-parameter hook', (done) => {
    const runner = createRunner();
    const transaction = createTransaction();
    runHooks(
      runner,
      [
        (t) => {
          t.request.headers.X = '1';
        },
      ],
      transaction,
      (err) => {
        assert.equal(transaction.request.headers.X, '1');
        done(err);
      },
    );
  });

  it('waits for an async hook before going on', (done) => {
    const runner = createRunner();
    const transaction = createTransaction();
    const hook = async (t) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      t.request.headers.Authorization = 'token';
    };
    runHooks(runner, [hook], transaction, (err) => {
      assert.equal(transaction.request.headers.Authorization, 'token');
      done(err);
    });
  });

  it('reports a rejected async hook as a hook error instead of crashing', (done) => {
    const runner = createRunner();
    const hook = async () => {
      throw new Error('boom');
    };
    runHooks(runner, [hook], createTransaction(), (err) => {
      assert.deepEqual(
        runner.hookErrors.map((error) => error.message),
        ['boom'],
      );
      done(err);
    });
  });

  it('fails the transaction when an async hook rejects with an assertion', (done) => {
    const runner = createRunner();
    runner.configuration = { emitter: new EventEmitter() };
    const transaction = createTransaction();
    const hook = async () => {
      assert.equal(1, 2);
    };
    runHooks(runner, [hook], transaction, (err) => {
      assert.isTrue(transaction.fail);
      assert.lengthOf(runner.hookErrors, 0);
      done(err);
    });
  });

  it('finishes a (transaction, done) hook when done() is called', (done) => {
    const runner = createRunner();
    let calls = 0;
    const hook = (t, hookDone) => {
      calls += 1;
      setTimeout(hookDone, 10);
    };
    runHooks(runner, [hook], createTransaction(), (err) => {
      assert.equal(calls, 1);
      done(err);
    });
  });

  it('reports an async (transaction, done) hook that rejects before calling done()', (done) => {
    const runner = createRunner();
    // eslint-disable-next-line no-unused-vars
    const hook = async (t, hookDone) => {
      throw new Error('before done');
    };
    runHooks(runner, [hook], createTransaction(), (err) => {
      assert.deepEqual(
        runner.hookErrors.map((error) => error.message),
        ['before done'],
      );
      done(err);
    });
  });
});
