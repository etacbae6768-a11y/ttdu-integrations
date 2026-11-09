// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Guarded HTTP for the office-system connectors.
// - The destination is checked when the socket connects (DNS answer included): only this PC (loopback) and the
//   office network (private / link-local / CGNAT-VPN ranges) unless the office config sets "allow_public": true.
// - Redirects are never followed (a 3xx is an error), so a server cannot bounce the request elsewhere.
// - Timeouts and a response size cap. Secrets go only into request headers, never into error messages.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const V4 = (ip) => ip.split('.').map(Number);
/** 'loopback' | 'private' | 'linklocal' | 'cgnat' | 'public' */
export function classifyIp(ip) {
  let a = String(ip || '').trim().replace(/^\[|\]$/g, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a); if (mapped) a = mapped[1];
  if (net.isIPv4(a)) {
    const [p, q] = V4(a);
    if (p === 127) return 'loopback';
    if (p === 10 || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168)) return 'private';
    if (p === 169 && q === 254) return 'linklocal';
    if (p === 100 && q >= 64 && q <= 127) return 'cgnat';
    if (p === 0) return 'loopback';
    return 'public';
  }
  if (net.isIPv6(a)) {
    const s = a.toLowerCase();
    if (s === '::1' || s === '::') return 'loopback';
    const first = parseInt(s.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return 'private';
    if ((first & 0xffc0) === 0xfe80) return 'linklocal';
    return 'public';
  }
  return 'public';
}
export const isOfficeNet = (ip) => classifyIp(ip) !== 'public';

function denied(host, address) {
  return Object.assign(new Error('The address ' + host + ' (' + address + ') is outside this PC and the office network. Only those addresses are allowed ("allow_public": true exists for development builds only; office delivery builds refuse it).'), { code: 'destination_not_allowed', details: { host, address } });
}
/** dns lookup that refuses public answers (used at connect time, so a changed DNS answer cannot slip through) */
export function guardedLookup(allowPublic) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    dns.lookup(hostname, { all: true, family: (options && options.family) || 0 }, (err, addrs) => {
      if (err) return cb(err);
      const list = (addrs || []).filter((x) => x && x.address);
      if (!list.length) return cb(Object.assign(new Error('no address for ' + hostname), { code: 'ENOTFOUND' }));
      if (!allowPublic) { const bad = list.find((x) => !isOfficeNet(x.address)); if (bad) return cb(denied(hostname, bad.address)); }
      if (options && options.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

export function joinUrl(base, rel) { return String(base).replace(/\/+$/, '') + '/' + String(rel).replace(/^\/+/, ''); }

/** check a base URL without connecting (scheme, no user:pass@, IP literal range) */
export function checkBaseUrl(raw, allowPublic) {
  let u; try { u = new URL(raw); } catch (e) { throw Object.assign(new Error('Not a valid address: ' + raw), { code: 'invalid_config' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw Object.assign(new Error('Address must start with http:// or https://'), { code: 'invalid_config' });
  if (u.username || u.password) throw Object.assign(new Error('Do not put a user name or password in the address; use secret_file.'), { code: 'invalid_config' });
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(h) && !allowPublic && !isOfficeNet(h)) throw denied(h, h);
  return u;
}

/**
 * @param {{url:string, allowPublic?:boolean, ca?:string|Buffer, timeoutMs?:number}} conn
 * @param {{method?:string, path:string, headers?:object, body?:Buffer|string|null, timeoutMs?:number, maxBytes?:number}} req
 * @returns {Promise<{status:number, headers:object, body:Buffer, text:()=>string, json:()=>any}>}
 */
export function request(conn, { method = 'GET', path = '', headers = {}, body = null, timeoutMs, maxBytes = 32 * 1024 * 1024 } = {}) {
  const target = checkBaseUrl(joinUrl(conn.url, path), !!conn.allowPublic);
  const isHttps = target.protocol === 'https:';
  const buf = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const h = { 'user-agent': 'ttdu-office-connect/0.1', ...headers };
  if (buf) h['content-length'] = String(buf.length);
  const limit = timeoutMs || conn.timeoutMs || 60000;
  return new Promise((resolve, reject) => {
    const r = (isHttps ? https : http).request(target, { method, headers: h, lookup: guardedLookup(!!conn.allowPublic), ca: isHttps && conn.ca ? conn.ca : undefined, timeout: limit }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > maxBytes) { res.destroy(); reject(Object.assign(new Error('The answer from ' + target.host + ' is larger than ' + maxBytes + ' bytes.'), { code: 'resource_limit' })); return; } chunks.push(c); });
      res.on('end', () => {
        const out = Buffer.concat(chunks);
        if (res.statusCode >= 300 && res.statusCode < 400) return reject(Object.assign(new Error(target.host + ' answered with a redirect (' + res.statusCode + '); check the address in connectors.json (http/https, path).'), { code: 'redirect_refused', details: { status: res.statusCode } }));
        resolve({ status: res.statusCode, headers: res.headers, body: out, text: () => out.toString('utf8'), json: () => JSON.parse(out.toString('utf8') || 'null') });
      });
      res.on('error', reject);
    });
    r.on('timeout', () => { r.destroy(Object.assign(new Error('No answer from ' + target.host + ' within ' + limit + ' ms.'), { code: 'timeout' })); });
    r.on('error', (e) => reject(e && e.code ? e : Object.assign(new Error(String(e && e.message)), { code: 'network_error' })));
    if (buf) r.end(buf); else r.end();
  });
}

/** multipart/form-data body from a FormData (Node's own encoder via Response) */
export async function formBody(fd) {
  const r = new Response(fd);
  return { body: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') };
}

/** short, secret-free description of an HTTP failure */
export function httpError(service, res, code = 'remote_error') {
  let msg = ''; try { const j = res.json(); msg = typeof j === 'string' ? j : (j && (j.detail || j.message || j.error || j.exc_type || (j.errors && j.errors[0] && j.errors[0].message) || JSON.stringify(j))) || ''; } catch (e) { msg = res.text().slice(0, 300); }
  const c = res.status === 401 || res.status === 403 ? 'auth_failed' : res.status === 404 ? 'not_found' : code;
  return Object.assign(new Error(service + ' HTTP ' + res.status + (msg ? ': ' + String(msg).slice(0, 300) : '')), { code: c, details: { status: res.status } });
}
