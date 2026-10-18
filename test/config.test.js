// -----------------------------------------------------------------------------
// The configuration: the address of the CiC (port 8080 by default) and the
// language.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseHost } from '../src/config.js';

test('the address: IP, name, port, http:// accepted; 8080 by default', () => {
  assert.deepEqual(parseHost('192.168.1.30'), {
    origin: 'http://192.168.1.30:8080',
    hostname: '192.168.1.30',
    port: 8080,
  });
  assert.equal(parseHost(' CIC.lan ').origin, 'http://cic.lan:8080');
  assert.equal(parseHost('192.168.1.30:8081').origin, 'http://192.168.1.30:8081');
  assert.equal(parseHost('http://192.168.1.30/').origin, 'http://192.168.1.30:8080');
  assert.equal(parseHost('192.168.1.30:80').origin, 'http://192.168.1.30:80');
  assert.equal(parseHost('http://192.168.1.30:80').origin, 'http://192.168.1.30:80');
  assert.equal(parseHost('[fd00::30]').origin, 'http://[fd00::30]:8080');
});

test('the address: refused with a reason', () => {
  assert.deepEqual(parseHost(''), { error: 'empty' });
  assert.deepEqual(parseHost(undefined), { error: 'empty' });
  assert.deepEqual(parseHost('https://192.168.1.30'), { error: 'https' });
  assert.deepEqual(parseHost('ftp://192.168.1.30'), { error: 'invalid' });
  assert.deepEqual(parseHost('192.168.1.30/beta/feed/data.json'), { error: 'invalid' });
  assert.deepEqual(parseHost('user:pass@192.168.1.30'), { error: 'invalid' });
  assert.deepEqual(parseHost('192.168.1.30?x=1'), { error: 'invalid' });
  assert.deepEqual(parseHost('http://'), { error: 'invalid' });
});

test('normalizeConfig: defaults and language', () => {
  assert.deepEqual(normalizeConfig(), { cic: null, hostError: 'empty', language: 'fr' });
  assert.equal(normalizeConfig(null).language, 'fr');
  assert.equal(normalizeConfig({ host: '10.0.0.5', language: 'en' }).language, 'en');
  assert.equal(normalizeConfig({ host: '10.0.0.5', language: 'de' }).language, 'fr');
  assert.equal(normalizeConfig({ host: '10.0.0.5' }).cic.origin, 'http://10.0.0.5:8080');
});
