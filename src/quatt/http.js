// -----------------------------------------------------------------------------
// The only network access of the integration: one plain HTTP GET to the CiC
// on node:http (its local API speaks no TLS). A deadline for the whole
// exchange, a size cap on the body, no redirect followed, no keep-alive.
// Resolves { status, headers, body } for any status; rejects a CicError for
// the transport failures.
// -----------------------------------------------------------------------------

import http from 'node:http';
import { CODES, CicError } from './errors.js';

function transportError(err) {
  const code = String(err?.code ?? '');
  // Something answered, but not in HTTP (a wrong port).
  if (code.startsWith('HPE_')) return new CicError(CODES.BAD_ANSWER, `Not HTTP (${code})`);
  // Only the error code: a message may carry an address.
  return new CicError(CODES.UNREACHABLE, code || 'Connection failed');
}

/**
 * @param {string} url absolute http URL
 * @param {object} options
 * @param {number} options.timeout ms for the whole exchange
 * @param {number} options.maxBytes body size cap
 */
export function httpRequest(url, { timeout, maxBytes } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    let settled = false;
    let req = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        req?.destroy();
        reject(error);
      } else {
        resolve(value);
      }
    };
    const timer = setTimeout(
      () => finish(new CicError(CODES.TIMEOUT, `No answer within ${Math.round(timeout / 1000)} s`)),
      timeout,
    );

    try {
      req = http.request(
        {
          method: 'GET',
          host: target.hostname.replace(/^\[(.*)\]$/, '$1'),
          port: Number(target.port) || 80,
          path: `${target.pathname}${target.search}`,
          agent: false,
          headers: {
            accept: 'application/json',
            host: target.host,
            connection: 'close',
          },
        },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
              finish(new CicError(CODES.TOO_LARGE, `Answer above ${maxBytes} bytes`));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () =>
            finish(null, {
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          );
          res.on('error', (err) => finish(transportError(err)));
        },
      );
      req.on('error', (err) => finish(transportError(err)));
      req.end();
    } catch (err) {
      finish(transportError(err));
    }
  });
}
