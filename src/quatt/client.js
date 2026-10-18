// -----------------------------------------------------------------------------
// The local JSON API of the Quatt CiC (Commissioning and Control):
//   GET http://<cic>:8080/beta/feed/data.json   the whole installation, read only
// Not documented by Quatt: the path and the shapes come from
// home-assistant-quatt (api_local_cic.py). Plain HTTP, no authentication. The
// integration never sends anything else to the CiC.
// -----------------------------------------------------------------------------

import { API, MAX_BYTES, TIMEOUTS } from '../constants.js';
import { CODES, CicError } from './errors.js';
import { httpRequest } from './http.js';
import { parseFeed, parseJson } from './parse.js';

/** Seconds of a Retry-After header (delta form only), in ms, or null. */
export const retryAfterMs = (value) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !/^\d{1,6}$/.test(raw.trim())) return null;
  return Number(raw.trim()) * 1000;
};

export class CicClient {
  /**
   * @param {object} options
   * @param {string} options.origin `http://host:port`
   * @param {Function} [options.request] the HTTP transport (tests inject a fake CiC)
   */
  constructor({ origin, request = httpRequest }) {
    this.url = new URL(API.PATH, origin).toString();
    this.request = request;
    this.closed = false;
  }

  close() {
    this.closed = true;
  }

  /** The feed, parsed (src/quatt/parse.js); rejects a CicError. */
  async feed() {
    if (this.closed) throw new CicError(CODES.CLOSED, 'Client closed');
    const response = await this.request(this.url, {
      timeout: TIMEOUTS.REQUEST,
      maxBytes: MAX_BYTES,
    });
    if (response.status < 200 || response.status > 299) {
      throw new CicError(CODES.HTTP, `HTTP ${response.status}`, {
        status: response.status,
        retryAfterMs: retryAfterMs(response.headers?.['retry-after']),
      });
    }
    const json = parseJson(response.body?.toString('utf8') ?? '');
    if (json === null) throw new CicError(CODES.BAD_ANSWER, 'Not JSON');
    const feed = parseFeed(json);
    if (!feed) throw new CicError(CODES.BAD_ANSWER, 'Not the feed of a Quatt CiC');
    return feed;
  }
}
