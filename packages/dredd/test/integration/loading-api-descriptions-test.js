import sinon from 'sinon';
import * as path from 'path';
import express from 'express';
import { assert } from 'chai';

import { DEFAULT_SERVER_PORT } from './helpers';
import Dredd from '../../lib/Dredd';

const EXPECTED_API_DESCRIPTION_PROPS = [
  'location',
  'content',
  'mediaType',
  'apiElements',
  'transactions',
  'annotations',
];

function createDredd(configuration) {
  const dredd = new Dredd(configuration);
  dredd.transactionRunner = {
    config: sinon.stub(),
    run: sinon.stub().yields(),
  };
  return dredd;
}

describe('Loading API descriptions', () => {
  describe('when the API description is specified by configuration', () => {
    let dredd;
    const content = `openapi: "3.0.0"
info:
  title: Machines API
  version: "1.0"
paths:
  /machines:
    get:
      responses:
        "200":
          description: OK
          content:
            "text/plain": {}
`;

    before((done) => {
      dredd = createDredd({ apiDescriptions: [content] });
      dredd.run(done);
    });

    it('loads the API description', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions, 1);
    });
    it('the API description has all expected data', () => {
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[0],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
    });
    it('the location is set to the configuration', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'location',
        'configuration.apiDescriptions[0]',
      );
    });
    it('the content is set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'content',
        content,
      );
    });
    it('the media type is set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'mediaType',
        'application/vnd.oai.openapi',
      );
    });
    it('the transactions are set', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions[0].transactions, 1);
      assert.equal(
        dredd.configuration.apiDescriptions[0].transactions[0].name,
        'Machines API > /machines > GET > 200 > text/plain',
      );
    });
    it('the transaction runner is called with the transactions', () => {
      assert.lengthOf(dredd.transactionRunner.run.firstCall.args[0], 1);
      assert.equal(
        dredd.transactionRunner.run.firstCall.args[0][0].name,
        'Machines API > /machines > GET > 200 > text/plain',
      );
    });
  });

  describe('when the API description is specified by a path', () => {
    let dredd;

    before((done) => {
      dredd = createDredd({
        options: { path: './test/fixtures/single-get.yaml' },
      });
      dredd.run(done);
    });

    it('loads the API description', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions, 1);
    });
    it('the API description has all expected data', () => {
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[0],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
    });
    it('the location is set to the path', () => {
      assert.match(
        dredd.configuration.apiDescriptions[0].location,
        /single-get\.yaml$/,
      );
      assert.isTrue(
        path.isAbsolute(dredd.configuration.apiDescriptions[0].location),
      );
    });
    it('the content is set', () => {
      assert.include(
        dredd.configuration.apiDescriptions[0].content,
        'Get Machines',
      );
    });
    it('the media type is set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'mediaType',
        'application/vnd.oai.openapi',
      );
    });
    it('the transactions are set', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions[0].transactions, 1);
      assert.equal(
        dredd.configuration.apiDescriptions[0].transactions[0].name,
        'Machines API > /machines > Get Machines > 200 > application/json; charset=utf-8',
      );
    });
    it('the transaction runner is called with the transactions', () => {
      assert.lengthOf(dredd.transactionRunner.run.firstCall.args[0], 1);
      assert.equal(
        dredd.transactionRunner.run.firstCall.args[0][0].name,
        'Machines API > /machines > Get Machines > 200 > application/json; charset=utf-8',
      );
    });
  });

  describe('when the API description is specified by a non-existing path', () => {
    let error;
    let dredd;

    before((done) => {
      dredd = createDredd({ options: { path: '__non-existing__.yaml' } });
      dredd.run((err) => {
        error = err;
        done();
      });
    });

    it('results in an error', () => {
      assert.instanceOf(error, Error);
    });
    it('the error is descriptive', () => {
      assert.equal(
        error.message,
        "Could not find any files on path: '__non-existing__.yaml'",
      );
    });
    it('aborts Dredd', () => {
      assert.isFalse(dredd.transactionRunner.run.called);
    });
  });

  describe('when the API description is specified by a glob pattern', () => {
    let dredd;

    before((done) => {
      dredd = createDredd({
        options: { path: './test/fixtures/multifile/*.yaml' },
      });
      dredd.run(done);
    });

    it('loads the API descriptions', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions, 3);
    });
    it('the API descriptions have all expected data', () => {
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[0],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[1],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[2],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
    });
    it('the locations are set to the absolute paths', () => {
      assert.match(
        dredd.configuration.apiDescriptions[0].location,
        /greeting\.yaml$/,
      );
      assert.match(
        dredd.configuration.apiDescriptions[1].location,
        /message\.yaml$/,
      );
      assert.match(
        dredd.configuration.apiDescriptions[2].location,
        /name\.yaml$/,
      );
      assert.isTrue(
        path.isAbsolute(dredd.configuration.apiDescriptions[0].location),
      );
      assert.isTrue(
        path.isAbsolute(dredd.configuration.apiDescriptions[1].location),
      );
      assert.isTrue(
        path.isAbsolute(dredd.configuration.apiDescriptions[2].location),
      );
    });
    it('the contents are set', () => {
      assert.include(
        dredd.configuration.apiDescriptions[0].content,
        'Greeting API',
      );
      assert.include(
        dredd.configuration.apiDescriptions[1].content,
        'Message API',
      );
      assert.include(
        dredd.configuration.apiDescriptions[2].content,
        'Name API',
      );
    });
    it('the media types are set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'mediaType',
        'application/vnd.oai.openapi',
      );
      assert.propertyVal(
        dredd.configuration.apiDescriptions[1],
        'mediaType',
        'application/vnd.oai.openapi',
      );
      assert.propertyVal(
        dredd.configuration.apiDescriptions[2],
        'mediaType',
        'application/vnd.oai.openapi',
      );
    });
    it('the transactions are set', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions[0].transactions, 1);
      assert.lengthOf(dredd.configuration.apiDescriptions[1].transactions, 1);
      assert.lengthOf(dredd.configuration.apiDescriptions[2].transactions, 1);
      assert.equal(
        dredd.configuration.apiDescriptions[0].transactions[0].name,
        'Greeting API > /greeting > GET > 200 > text/plain; charset=utf-8',
      );
      assert.equal(
        dredd.configuration.apiDescriptions[1].transactions[0].name,
        'Message API > /message > GET > 200 > text/plain; charset=utf-8',
      );
      assert.equal(
        dredd.configuration.apiDescriptions[2].transactions[0].name,
        'Name API > /name > GET > 200 > text/plain; charset=utf-8',
      );
    });
    it('the transaction runner is called with the transactions', () => {
      const transactions = dredd.transactionRunner.run.firstCall.args[0];
      assert.lengthOf(transactions, 3);
      assert.equal(
        transactions[0].name,
        'Greeting API > /greeting > GET > 200 > text/plain; charset=utf-8',
      );
      assert.equal(
        transactions[1].name,
        'Message API > /message > GET > 200 > text/plain; charset=utf-8',
      );
      assert.equal(
        transactions[2].name,
        'Name API > /name > GET > 200 > text/plain; charset=utf-8',
      );
    });
  });

  describe('when the API description is specified by a glob pattern resolving to no files', () => {
    let error;
    let dredd;

    before((done) => {
      dredd = createDredd({
        options: { path: '__non-existing-*-glob__.yaml' },
      });
      dredd.run((err) => {
        error = err;
        done();
      });
    });

    it('results in an error', () => {
      assert.instanceOf(error, Error);
    });
    it('the error is descriptive', () => {
      assert.equal(
        error.message,
        "Could not find any files on path: '__non-existing-*-glob__.yaml'",
      );
    });
    it('aborts Dredd', () => {
      assert.isFalse(dredd.transactionRunner.run.called);
    });
  });

  describe('when the API description is specified by URL', () => {
    let dredd;
    const content = `openapi: "3.0.0"
info:
  title: Machines API
  version: "1.0"
paths:
  /machines:
    get:
      responses:
        "200":
          description: OK
          content:
            "text/plain": {}
`;

    before((done) => {
      const app = express();
      app.get('/file.yaml', (req, res) => {
        res.type('application/vnd.oai.openapi').send(content);
      });

      const server = app.listen(DEFAULT_SERVER_PORT, (listenErr) => {
        if (listenErr) {
          done(listenErr);
          return;
        }
        dredd = createDredd({
          options: {
            path: `http://127.0.0.1:${DEFAULT_SERVER_PORT}/file.yaml`,
          },
        });
        dredd.run((dreddErr) => {
          server.close(() => {
            done(dreddErr);
          });
        });
      });
    });

    it('loads the API description', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions, 1);
    });
    it('the API description has all expected data', () => {
      assert.hasAllKeys(
        dredd.configuration.apiDescriptions[0],
        EXPECTED_API_DESCRIPTION_PROPS,
      );
    });
    it('the location is set to the URL', () => {
      assert.equal(
        dredd.configuration.apiDescriptions[0].location,
        `http://127.0.0.1:${DEFAULT_SERVER_PORT}/file.yaml`,
      );
    });
    it('the content is set', () => {
      assert.equal(dredd.configuration.apiDescriptions[0].content, content);
    });
    it('the media type is set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'mediaType',
        'application/vnd.oai.openapi',
      );
    });
    it('the transactions are set', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions[0].transactions, 1);
      assert.equal(
        dredd.configuration.apiDescriptions[0].transactions[0].name,
        'Machines API > /machines > GET > 200 > text/plain',
      );
    });
    it('the transaction runner is called with the transactions', () => {
      assert.lengthOf(dredd.transactionRunner.run.firstCall.args[0], 1);
      assert.equal(
        dredd.transactionRunner.run.firstCall.args[0][0].name,
        'Machines API > /machines > GET > 200 > text/plain',
      );
    });
  });

  describe('when the API description is specified by URL with a non-existing server', () => {
    let error;
    let dredd;

    before((done) => {
      dredd = createDredd({
        options: { path: 'http://example.example:1234/file.yaml' },
      });
      dredd.run((err) => {
        error = err;
        done();
      });
    });

    it('results in an error', () => {
      assert.instanceOf(error, Error);
    });
    it('the error is descriptive', () => {
      assert.include(
        error.message,
        "Unable to load API description document from 'http://example.example:1234/file.yaml': ",
      );
      assert.include(error.message, 'ENOTFOUND');
    });
    it('aborts Dredd', () => {
      assert.isFalse(dredd.transactionRunner.run.called);
    });
  });

  describe('when the API description is specified by URL pointing to a non-existing file', () => {
    let error;
    let dredd;

    before((done) => {
      const app = express();
      const server = app.listen(DEFAULT_SERVER_PORT, (listenErr) => {
        if (listenErr) {
          done(listenErr);
          return;
        }
        dredd = createDredd({
          options: {
            path: `http://127.0.0.1:${DEFAULT_SERVER_PORT}/file.yaml`,
          },
        });
        dredd.run((dreddErr) => {
          error = dreddErr;
          server.close(done);
        });
      });
    });

    it('results in an error', () => {
      assert.instanceOf(error, Error);
    });
    it('the error is descriptive', () => {
      assert.include(
        error.message,
        `Unable to load API description document from 'http://127.0.0.1:${DEFAULT_SERVER_PORT}/file.yaml': `,
      );
      assert.include(error.message, 'Dredd got HTTP 404 response');
    });
    it('aborts Dredd', () => {
      assert.isFalse(dredd.transactionRunner.run.called);
    });
  });

  describe('when there are multiple API descriptions', () => {
    let dredd;
    const content1 = `openapi: "3.0.0"
info:
  title: Beehive API v1
  version: "1.0"
paths:
  /honey:
    get:
      responses:
        "200":
          description: OK
          content:
            "text/plain": {}
`;
    const content2 = `openapi: "3.0.0"
info:
  title: Beehive API v2
  version: "1.0"
paths:
  /honey:
    get:
      responses:
        "200":
          description: OK
          content:
            "text/plain": {}
  /bees:
    get:
      responses:
        "200":
          description: OK
          content:
            "text/plain": {}
`;

    before((done) => {
      dredd = createDredd({
        apiDescriptions: [content1, content2],
        options: { path: './test/fixtures/single-get.yaml' },
      });
      dredd.run(done);
    });

    it('loads the API descriptions', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions, 3);
    });
    it('the media type is set', () => {
      assert.propertyVal(
        dredd.configuration.apiDescriptions[0],
        'mediaType',
        'application/vnd.oai.openapi',
      );
    });
    it('the transactions are set', () => {
      assert.lengthOf(dredd.configuration.apiDescriptions[0].transactions, 1);
      assert.lengthOf(dredd.configuration.apiDescriptions[1].transactions, 2);
      assert.lengthOf(dredd.configuration.apiDescriptions[2].transactions, 1);
    });
    it('the transaction runner is called with the transactions', () => {
      const transactions = dredd.transactionRunner.run.firstCall.args[0];

      assert.lengthOf(transactions, 4);
      assert.deepEqual(
        transactions.map(({ name }) => name),
        [
          'Beehive API v1 > /honey > GET > 200 > text/plain',
          'Beehive API v2 > /honey > GET > 200 > text/plain',
          'Beehive API v2 > /bees > GET > 200 > text/plain',
          'Machines API > /machines > Get Machines > 200 > application/json; charset=utf-8',
        ],
      );
    });
  });
});
