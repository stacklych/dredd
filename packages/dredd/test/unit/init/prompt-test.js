import { assert } from 'chai';

import { prompt } from '../../../lib/init';

// Returns a fake inquirer loader whose prompt() optionally hands the
// constructed questions to 'capture' and resolves with the given answers.
function fakeInquirerLoader(answers, capture) {
  return () =>
    Promise.resolve({
      prompt: (questions) => {
        if (capture) {
          capture(questions);
        }
        return Promise.resolve(answers);
      },
    });
}

function questionByName(questions, name) {
  return questions.find((question) => question.name === name);
}

describe('init.prompt()', () => {
  const detected = {
    ci: [],
    apiDescription: 'api.yaml',
    server: 'npm start',
    language: 'nodejs',
  };

  it('passes the answers from inquirer to the callback', (done) => {
    const answers = {
      apiDescription: 'api.yaml',
      apiHost: 'http://127.0.0.1:3000',
    };
    prompt(
      { custom: {} },
      detected,
      (error, result) => {
        assert.isNull(error);
        assert.deepEqual(result, answers);
        done();
      },
      { loadInquirer: fakeInquirerLoader(answers) },
    );
  });

  it('uses detected and config values as question defaults', (done) => {
    let questions;
    prompt(
      { custom: {}, server: 'bundle exec rails server' },
      detected,
      () => {
        assert.equal(
          questionByName(questions, 'apiDescription').default,
          'api.yaml',
        );
        assert.equal(
          questionByName(questions, 'server').default,
          'bundle exec rails server',
        );
        assert.equal(
          questionByName(questions, 'apiHost').default,
          'http://127.0.0.1:3000',
        );
        assert.equal(questionByName(questions, 'language').default, 'nodejs');
        done();
      },
      {
        loadInquirer: fakeInquirerLoader({}, (q) => {
          questions = q;
        }),
      },
    );
  });

  it('asks for the hooks language only when hooks are enabled', (done) => {
    let questions;
    prompt(
      { custom: {} },
      detected,
      () => {
        const language = questionByName(questions, 'language');
        assert.isTrue(language.when({ hooks: true }));
        assert.isFalse(language.when({ hooks: false }));
        done();
      },
      {
        loadInquirer: fakeInquirerLoader({}, (q) => {
          questions = q;
        }),
      },
    );
  });

  it('offers to create CI configuration only when none is detected', (done) => {
    let questions;
    prompt(
      { custom: {} },
      { ...detected, ci: [] },
      () => {
        assert.isTrue(questionByName(questions, 'ci').when());
        done();
      },
      {
        loadInquirer: fakeInquirerLoader({}, (q) => {
          questions = q;
        }),
      },
    );
  });

  it('does not offer Apiary reporting when it is already configured', (done) => {
    let questions;
    prompt(
      { custom: {}, reporter: 'apiary' },
      detected,
      () => {
        assert.isFalse(questionByName(questions, 'apiary').when());
        done();
      },
      {
        loadInquirer: fakeInquirerLoader({}, (q) => {
          questions = q;
        }),
      },
    );
  });
});
