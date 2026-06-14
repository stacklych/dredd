import * as path from 'path';
import { assert } from 'chai';

import resolveLocations from '../../lib/resolveLocations';

describe('resolveLocations()', () => {
  const workingDirectory = path.join(__filename, '..', '..', 'fixtures');

  describe('when given no locations', () => {
    it('produces no results', () => {
      const locations = resolveLocations(workingDirectory, []);
      assert.deepEqual(locations, []);
    });
  });

  describe('when given paths', () => {
    it('resolves them into absolute paths', () => {
      const locations = resolveLocations(workingDirectory, [
        './multifile/*.yaml',
        './apiary.yaml',
      ]);
      assert.deepEqual(locations, [
        path.join(workingDirectory, '/multifile/greeting.yaml'),
        path.join(workingDirectory, '/multifile/message.yaml'),
        path.join(workingDirectory, '/multifile/name.yaml'),
        path.join(workingDirectory, 'apiary.yaml'),
      ]);
    });
  });

  describe('when given non-existing paths', () => {
    it('throws an error', () => {
      assert.throws(() => {
        resolveLocations(workingDirectory, ['./foo/bar/moo/boo/*.yaml']);
      }, './foo/bar/moo/boo/*.yaml');
    });
  });

  describe('when given HTTP URLs', () => {
    it('recognizes they are URLs', () => {
      const locations = resolveLocations(workingDirectory, [
        'http://example.com/foo.yaml',
        './apiary.yaml',
      ]);
      assert.deepEqual(locations, [
        'http://example.com/foo.yaml',
        path.join(workingDirectory, 'apiary.yaml'),
      ]);
    });
  });

  describe('when given HTTPS URLs', () => {
    it('recognizes they are URLs', () => {
      const locations = resolveLocations(workingDirectory, [
        'https://example.com/foo.yaml',
        './apiary.yaml',
      ]);
      assert.deepEqual(locations, [
        'https://example.com/foo.yaml',
        path.join(workingDirectory, 'apiary.yaml'),
      ]);
    });
  });

  describe('when given duplicate locations', () => {
    it('returns only the distinct ones', () => {
      const locations = resolveLocations(workingDirectory, [
        './apiary.yaml',
        'http://example.com/foo.yaml',
        'http://example.com/foo.yaml',
        './apiar*.yaml',
      ]);
      assert.deepEqual(locations, [
        path.join(workingDirectory, 'apiary.yaml'),
        'http://example.com/foo.yaml',
      ]);
    });
  });

  describe('when given various locations', () => {
    it('keeps their original order', () => {
      const locations = resolveLocations(workingDirectory, [
        './apiar*.yaml',
        'https://example.com/foo.yaml',
        './multifile/*.yaml',
        'http://example.com/bar.yaml',
      ]);
      assert.deepEqual(locations, [
        path.join(workingDirectory, 'apiary.yaml'),
        'https://example.com/foo.yaml',
        path.join(workingDirectory, '/multifile/greeting.yaml'),
        path.join(workingDirectory, '/multifile/message.yaml'),
        path.join(workingDirectory, '/multifile/name.yaml'),
        'http://example.com/bar.yaml',
      ]);
    });
  });
});
