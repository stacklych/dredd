import * as bodyParser from 'body-parser';
import { assert } from 'chai';
import fs from 'fs';
import * as path from 'path';

import { runDreddWithServer, createServer } from './helpers';
import Dredd from '../../lib/Dredd';

describe("Sending 'application/json' request", () => {
  let runtimeInfo;
  const contentType = 'application/json';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.text({ type: contentType }),
    });
    app.post('/data', (req, res) => res.json({ test: 'OK' }));

    const dredd = new Dredd({
      options: { path: './test/fixtures/request/application-json.yaml' },
    });

    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () =>
    assert.isTrue(runtimeInfo.server.requestedOnce));
  it('the request has the expected Content-Type', () =>
    assert.equal(
      runtimeInfo.server.lastRequest.headers['content-type'],
      contentType,
    ));
  it('the request has the expected format', () => {
    const { body } = runtimeInfo.server.lastRequest;
    assert.deepEqual(JSON.parse(body), { test: 42 });
  });
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});

describe("Sending 'multipart/form-data' request", () => {
  let runtimeInfo;
  const contentType = 'multipart/form-data';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.text({ type: contentType }),
    });
    app.post('/data', (req, res) => res.json({ test: 'OK' }));
    const dredd = new Dredd({
      options: { path: './test/fixtures/request/multipart-form-data.yaml' },
    });

    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () =>
    assert.isTrue(runtimeInfo.server.requestedOnce));
  it('the request has the expected Content-Type', () =>
    assert.include(
      runtimeInfo.server.lastRequest.headers['content-type'],
      'multipart/form-data',
    ));
  it('the request has the expected format', () => {
    const lines = [
      '--CUSTOM-BOUNDARY',
      'Content-Disposition: form-data; name="text"',
      '',
      'test equals to 42',
      '--CUSTOM-BOUNDARY',
      'Content-Disposition: form-data; name="json"',
      '',
      '{"test": 42}',
      '',
      '--CUSTOM-BOUNDARY--',
      '',
    ];
    assert.equal(runtimeInfo.server.lastRequest.body, lines.join('\r\n'));
  });
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});

describe("Sending 'application/x-www-form-urlencoded' request", () => {
  let runtimeInfo;
  const contentType = 'application/x-www-form-urlencoded';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.text({ type: contentType }),
    });
    app.post('/data', (req, res) => res.json({ test: 'OK' }));
    const dredd = new Dredd({
      options: {
        path: './test/fixtures/request/application-x-www-form-urlencoded.yaml',
      },
    });

    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () => {
    assert.isTrue(runtimeInfo.server.requestedOnce);
  });
  it('the request has the expected Content-Type', () => {
    assert.equal(
      runtimeInfo.server.lastRequest.headers['content-type'],
      contentType,
    );
  });
  it('the request has the expected format', () => {
    assert.equal(runtimeInfo.server.lastRequest.body.trim(), 'test=42');
  });
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});

describe("Sending 'text/plain' request", () => {
  let runtimeInfo;
  const contentType = 'text/plain';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.text({ type: contentType }),
    });
    app.post('/data', (req, res) => res.json({ test: 'OK' }));
    const dredd = new Dredd({
      options: { path: './test/fixtures/request/text-plain.yaml' },
    });

    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () => {
    assert.isTrue(runtimeInfo.server.requestedOnce);
  });
  it('the request has the expected Content-Type', () => {
    assert.equal(
      runtimeInfo.server.lastRequest.headers['content-type'],
      contentType,
    );
  });
  it('the request has the expected format', () => {
    assert.equal(runtimeInfo.server.lastRequest.body, 'test equals to 42\n');
  });
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});

describe("Sending 'application/octet-stream' request", () => {
  let runtimeInfo;
  const contentType = 'application/octet-stream';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.raw({ type: contentType }),
    });
    app.post('/binary', (req, res) => res.json({ test: 'OK' }));

    const dredd = new Dredd({
      options: {
        path: './test/fixtures/request/application-octet-stream.yaml',
        hookfiles: './test/fixtures/request/application-octet-stream-hooks.js',
      },
    });
    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () =>
    assert.isTrue(runtimeInfo.server.requestedOnce));
  it('the request has the expected Content-Type', () =>
    assert.equal(
      runtimeInfo.server.lastRequest.headers['content-type'],
      contentType,
    ));
  it('the request has the expected format', () =>
    assert.equal(
      runtimeInfo.server.lastRequest.body.toString('base64'),
      Buffer.from([0xff, 0xef, 0xbf, 0xbe]).toString('base64'),
    ));
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});

describe("Sending 'image/png' request", () => {
  let runtimeInfo;
  const contentType = 'image/png';

  before((done) => {
    const app = createServer({
      bodyParser: bodyParser.raw({ type: contentType }),
    });
    app.put('/image.png', (req, res) => res.json({ test: 'OK' }));

    const dredd = new Dredd({
      options: {
        path: './test/fixtures/request/image-png.yaml',
        hookfiles: './test/fixtures/request/image-png-hooks.js',
      },
    });
    runDreddWithServer(dredd, app, (err, info) => {
      runtimeInfo = info;
      done(err);
    });
  });

  it('results in one request being delivered to the server', () =>
    assert.isTrue(runtimeInfo.server.requestedOnce));
  it('the request has the expected Content-Type', () =>
    assert.equal(
      runtimeInfo.server.lastRequest.headers['content-type'],
      contentType,
    ));
  it('the request has the expected format', () =>
    assert.equal(
      runtimeInfo.server.lastRequest.body.toString('base64'),
      fs
        .readFileSync(path.join(__dirname, '../fixtures/image.png'))
        .toString('base64'),
    ));
  it('results in one passing test', () => {
    assert.equal(runtimeInfo.dredd.stats.tests, 1);
    assert.equal(runtimeInfo.dredd.stats.passes, 1);
  });
});
