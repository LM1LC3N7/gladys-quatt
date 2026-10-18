// -----------------------------------------------------------------------------
// The real transport (node:http) against a fake CiC on loopback.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CicClient, retryAfterMs } from '../src/quatt/client.js';
import { CODES } from '../src/quatt/errors.js';
import { httpRequest } from '../src/quatt/http.js';
import { UUID, createFakeCic } from './helpers/fakeCic.js';

async function server(handler) {
  const s = http.createServer(handler);
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${s.address().port}`,
    close: () =>
      new Promise((resolve) => {
        s.closeAllConnections?.();
        s.close(resolve);
      }),
  };
}

test('the feed, over HTTP: one GET of /beta/feed/data.json', async () => {
  const fake = createFakeCic();
  const cic = await fake.listen();
  try {
    const client = new CicClient({ origin: cic.origin });
    const feed = await client.feed();
    assert.equal(feed.cicId, UUID);
    assert.deepEqual(
      fake.requests.map((r) => [r.method, r.path]),
      [['GET', '/beta/feed/data.json']],
    );
  } finally {
    await cic.close();
  }
});

test('the error of an HTTP status never carries the text of the answer', async () => {
  const s = await server((req, res) => {
    res.writeHead(429, { 'retry-after': '120' });
    res.end('<html>internal path /var/secret</html>');
  });
  try {
    const err = await new CicClient({ origin: s.origin }).feed().catch((e) => e);
    assert.equal(err.code, CODES.HTTP);
    assert.equal(err.status, 429);
    assert.equal(err.message, 'HTTP 429');
    assert.equal(err.retryAfterMs, 120_000);
  } finally {
    await s.close();
  }
});

test('not JSON, not a CiC, too large, no answer in time', async () => {
  let mode = 'html';
  const s = await server((req, res) => {
    if (mode === 'html') res.end('<html></html>');
    else if (mode === 'other') res.end(JSON.stringify({ system: { hostName: 'router' } }));
    else if (mode === 'large') res.end('x'.repeat(200 * 1024));
    // 'silent': never answers
  });
  try {
    const client = new CicClient({ origin: s.origin });
    await assert.rejects(client.feed(), { code: CODES.BAD_ANSWER, message: 'Not JSON' });
    mode = 'other';
    await assert.rejects(client.feed(), { code: CODES.BAD_ANSWER });
    mode = 'large';
    await assert.rejects(client.feed(), { code: CODES.TOO_LARGE });
    mode = 'silent';
    await assert.rejects(httpRequest(`${s.origin}/x`, { timeout: 200, maxBytes: 1000 }), {
      code: CODES.TIMEOUT,
    });
  } finally {
    await s.close();
  }
});

test('nobody listening: unreachable, with the error code only', async () => {
  const s = await server(() => {});
  const { origin } = s;
  await s.close();
  const err = await httpRequest(`${origin}/beta/feed/data.json`, {
    timeout: 2000,
    maxBytes: 1000,
  }).catch((e) => e);
  assert.equal(err.code, CODES.UNREACHABLE);
  assert.doesNotMatch(err.message, /127\.0\.0\.1/);
});

test('a closed client sends nothing; Retry-After in seconds only', async () => {
  const fake = createFakeCic();
  const client = new CicClient({ origin: 'http://192.0.2.1:8080', request: fake.request });
  client.close();
  await assert.rejects(client.feed(), { code: CODES.CLOSED });
  assert.equal(fake.requests.length, 0);
  assert.equal(retryAfterMs('30'), 30_000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT'), null);
  assert.equal(retryAfterMs(undefined), null);
});
