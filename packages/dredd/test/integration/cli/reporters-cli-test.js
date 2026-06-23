import fs from 'fs';
import { assert } from 'chai';

import { runCLI, createServer, DEFAULT_SERVER_PORT } from '../helpers';

describe('CLI - Reporters', () => {
  let server;

  before((done) => {
    const app = createServer();

    app.get('/machines', (req, res) =>
      res.json([{ type: 'bulldozer', name: 'willy' }]),
    );

    server = app.listen((err) => {
      done(err);
    });
  });

  after((done) => server.close(done));

  describe('when -r/--reporter is provided to use additional reporters', () => {
    let cliInfo;
    const args = [
      './test/fixtures/single-get.yaml',
      `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
      '--reporter=nyan',
    ];

    before((done) => {
      runCLI(args, (err, info) => {
        cliInfo = info;
        done(err);
      });
    });

    it('should use given reporter', () => {
      // Nyan cat ears should exist in stdout
      assert.include(cliInfo.stdout, '/\\_/\\');
    });
  });

  describe('when -o/--output is used to specify output file', () => {
    const args = [
      './test/fixtures/single-get.yaml',
      `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
      '--reporter=xunit',
      '--output=__test_file_output__.xml',
    ];

    before((done) =>
      runCLI(args, (err) => {
        done(err);
      }),
    );

    after(() => fs.unlinkSync(`${process.cwd()}/__test_file_output__.xml`));

    it('should create given file', () =>
      assert.isOk(fs.existsSync(`${process.cwd()}/__test_file_output__.xml`)));
  });

  describe('when -o/--output is used multiple times to specify output files', () => {
    const args = [
      './test/fixtures/single-get.yaml',
      `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
      '--reporter=xunit',
      '--output=__test_file_output1__.xml',
      '--reporter=xunit',
      '--output=__test_file_output2__.xml',
    ];

    before((done) =>
      runCLI(args, (err) => {
        done(err);
      }),
    );

    after(() => {
      fs.unlinkSync(`${process.cwd()}/__test_file_output1__.xml`);
      fs.unlinkSync(`${process.cwd()}/__test_file_output2__.xml`);
    });

    it('should create given files', () => {
      assert.isOk(fs.existsSync(`${process.cwd()}/__test_file_output1__.xml`));
      assert.isOk(fs.existsSync(`${process.cwd()}/__test_file_output2__.xml`));
    });
  });

  describe('when -o/--output is used to specify output file but directory is not existent', () => {
    const args = [
      './test/fixtures/single-get.yaml',
      `http://127.0.0.1:${DEFAULT_SERVER_PORT}`,
      '--reporter=xunit',
      '--output=./__test_directory/__test_file_output__.xml',
    ];

    before((done) => {
      try {
        fs.unlinkSync(
          `${process.cwd()}/__test_directory/__test_file_output__.xml`,
        );
      } catch (error) {
        // Do nothing
      }

      runCLI(args, (err) => {
        done(err);
      });
    });

    after(() => {
      fs.unlinkSync(
        `${process.cwd()}/__test_directory/__test_file_output__.xml`,
      );
      fs.rmdirSync(`${process.cwd()}/__test_directory`);
    });

    it('should create given file', () =>
      assert.isOk(
        fs.existsSync(
          `${process.cwd()}/__test_directory/__test_file_output__.xml`,
        ),
      ));
  });
});
