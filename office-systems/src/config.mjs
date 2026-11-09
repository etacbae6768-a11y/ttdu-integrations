// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Office PC settings for the connectors: connectors.json next to the runner (or TTDU_CONNECTORS=<file>).
// {
//   "schema": "ttdu.connectors/v1",
//   "connectors": {
//     "paperless": { "type": "paperless", "url": "http://192.168.0.20:8000", "secret_file": "secrets/paperless.txt" },
//     "odoo":      { "type": "odoo", "url": "http://192.168.0.21:8069", "database": "office", "secret_file": "secrets/odoo.txt" },
//     "erpnext":   { "type": "erpnext", "url": "http://192.168.0.22:8000", "secret_file": "secrets/erpnext.txt" },
//     "twenty":    { "type": "twenty", "url": "http://192.168.0.23:3000", "secret_file": "secrets/twenty.txt" }
//   },
//   "allow_public": false
// }
// The secret (token / API key) lives in its own file (or env TTDU_SECRET_<ID>), so connectors.json can be shown
// to someone without giving away access. Nothing here is ever written to logs.
import fs from 'node:fs';
import path from 'node:path';
import { checkBaseUrl, classifyIp } from './net.mjs';
import net from 'node:net';

export const SCHEMA = 'ttdu.connectors/v1';
export const TYPES = ['paperless', 'odoo', 'erpnext', 'twenty'];
const bad = (msg, details) => Object.assign(new Error(msg), { code: 'invalid_config', details: details || {} });

export function defaultConfigFile(baseDir) {
  if (process.env.TTDU_CONNECTORS) return path.resolve(process.env.TTDU_CONNECTORS);
  return path.join(baseDir || process.cwd(), 'connectors.json');
}

/** @returns {{file:string, allowPublic:boolean, connectors:Record<string, object>}} */
export function loadConnectors(file, { env = process.env } = {}) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
    if (e && e.code === 'ENOENT') throw Object.assign(new Error('No connectors.json at ' + file + ' (copy connectors.example.json and fill in the address).'), { code: 'not_configured' });
    throw bad('connectors.json is not valid JSON: ' + e.message);
  }
  if (!j || j.schema !== SCHEMA) throw bad('connectors.json must have "schema": "' + SCHEMA + '"');
  const dir = path.dirname(path.resolve(file));
  const allowPublic = j.allow_public === true;
  const out = {};
  for (const [id, c] of Object.entries(j.connectors || {})) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw bad('Connector id must be letters, digits, - or _: ' + id);
    if (!c || !TYPES.includes(c.type)) throw bad('Connector ' + id + ': "type" must be one of ' + TYPES.join(', '));
    if (c.enabled === false) continue;
    const u = checkBaseUrl(c.url, allowPublic);
    let secret = env['TTDU_SECRET_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_')];
    if (!secret && c.secret_file) {
      const sf = path.resolve(dir, c.secret_file);
      try { secret = fs.readFileSync(sf, 'utf8').replace(/^\uFEFF/, '').trim(); } catch (e) { throw bad('Connector ' + id + ': cannot read secret_file ' + c.secret_file); }
    }
    if (!secret) throw bad('Connector ' + id + ': no secret (put the token/API key in secret_file or env TTDU_SECRET_' + id.toUpperCase() + ')');
    let ca;
    if (c.ca_file) { try { ca = fs.readFileSync(path.resolve(dir, c.ca_file)); } catch (e) { throw bad('Connector ' + id + ': cannot read ca_file ' + c.ca_file); } }
    out[id] = {
      id, type: c.type, url: u.href.replace(/\/+$/, ''), allowPublic, ca,
      timeoutMs: Number(c.timeout_ms) > 0 ? Number(c.timeout_ms) : 60000,
      database: c.database ? String(c.database) : undefined, // odoo
      protocol: c.protocol === 'jsonrpc' ? 'jsonrpc' : 'json2', // odoo: json2 (Odoo 19+) or jsonrpc (Odoo 14-18)
      login: c.login ? String(c.login) : undefined, // odoo jsonrpc
      site: c.site ? String(c.site) : undefined, // erpnext: X-Frappe-Site-Name when the bench is reached without its own host name (multi-site / direct gunicorn)
      defaults: c.defaults && typeof c.defaults === 'object' ? c.defaults : {}, // rule defaults per connector
    };
    Object.defineProperty(out[id], 'secret', { enumerable: false, value: secret }); // keep it out of JSON.stringify / logs
  }
  return { file: path.resolve(file), allowPublic, connectors: out };
}

/** one line per connector for run logs: no secrets */
export function describe(cfg) {
  return Object.values(cfg.connectors).map((c) => {
    const h = new URL(c.url).hostname.replace(/^\[|\]$/g, '');
    const where = h === 'localhost' || h === 'host.docker.internal' ? '이 PC' : net.isIP(h) ? ({ loopback: '이 PC', private: '사내망', linklocal: '사내망', cgnat: '사내 VPN', public: '외부(인터넷)' })[classifyIp(h)] : '이름 주소(연결 때 사내망 확인)';
    return `${c.id}(${c.type}) → ${c.url} [${where}]`;
  });
}
