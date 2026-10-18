// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { API } from './constants.js';

export const LANGUAGES = Object.freeze(['fr', 'en']);

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = Object.freeze({
  language: 'fr',
});

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The address of the CiC: `192.168.1.30`, `cic.lan`, `host:port` or
 * `http://host[:port]`; port 8080 by default. The local API speaks plain HTTP
 * only: https is refused (said to the user rather than failing in silence).
 * Credentials, a path, a query and a fragment are refused (an address ends
 * up in logs, and the path is fixed).
 *   -> { origin, hostname, port } or { error: 'empty' | 'invalid' | 'https' }
 */
export function parseHost(value) {
  const raw = text(value);
  if (!raw) return { error: 'empty' };
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw)?.[1]?.toLowerCase();
  if (scheme === 'https') return { error: 'https' };
  if (scheme && scheme !== 'http') return { error: 'invalid' };
  let url;
  try {
    url = new URL(scheme ? raw : `http://${raw}`);
  } catch {
    return { error: 'invalid' };
  }
  if (url.username || url.password) return { error: 'invalid' };
  if (url.search || url.hash || !url.hostname || url.pathname.replace(/\/+$/, '') !== '') {
    return { error: 'invalid' };
  }
  // new URL() drops the default port 80: an explicit ":80" is kept as typed.
  const explicit80 = /^(?:http:\/\/)?(?:\[[^\]]*\]|[^/:]*):80\/?$/i.test(raw);
  const port = url.port ? Number(url.port) : explicit80 ? 80 : API.PORT;
  const hostname = url.hostname.toLowerCase();
  return { origin: `http://${hostname}:${port}`, hostname, port };
}

export function normalizeConfig(raw = {}) {
  raw = raw ?? {};
  const host = parseHost(raw.host);
  const language = LANGUAGES.includes(String(raw.language))
    ? String(raw.language)
    : DEFAULTS.language;
  return {
    cic: host.error ? null : host,
    hostError: host.error ?? null,
    language,
  };
}
