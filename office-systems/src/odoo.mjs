// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Odoo connector: attach a result file to a record (거래처 res.partner, 직원 hr.employee, ...) as ir.attachment and,
// when the model has a chatter, log a note with the file. Odoo itself (LGPL-3.0) is installed separately by the office.
//   protocol "json2"   : Odoo 19+  POST /json/2/<model>/<method>, Authorization: bearer <API key>   (default)
//   protocol "jsonrpc" : Odoo 14-18 POST /jsonrpc (service common/object), login + API key as password
//                        (Odoo marks /jsonrpc deprecated; removal planned for Odoo 22)
// Docs: https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
// Rule fields: model (default res.partner), find {field: value} (default {name: "{client}"}), create_missing (default
//   false; true makes the record from `find` when none matches), name (attachment name, default "{file}"),
//   note (chatter text, default "TTDU 처리 결과: {file}"; false = no note), on_duplicate 'skip' (default) | 'store'
import crypto from 'node:crypto';
import { request, httpError } from './net.mjs';
import { fill, fillAll, mimeOf } from './template.mjs';

export function odoo(conn) {
  const legacy = conn.protocol === 'jsonrpc';
  let uid = null;
  async function rpc(service, method, args) {
    const r = await request(conn, { method: 'POST', path: 'jsonrpc', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }) });
    if (r.status !== 200) throw httpError('Odoo', r);
    const j = r.json();
    if (j && j.error) { const m = (j.error.data && (j.error.data.message || j.error.data.name)) || j.error.message || 'error'; throw Object.assign(new Error('Odoo: ' + String(m).slice(0, 300)), { code: /AccessDenied|Access Denied|password|credentials/i.test(m) ? 'auth_failed' : /AccessError/i.test(j.error.data && j.error.data.name) ? 'permission_denied' : 'remote_error' }); }
    return j.result;
  }
  async function json2(model, method, body) {
    const headers = { authorization: 'bearer ' + conn.secret, 'content-type': 'application/json; charset=utf-8', accept: 'application/json' };
    if (conn.database) headers['x-odoo-database'] = conn.database;
    const r = await request(conn, { method: 'POST', path: `json/2/${model}/${method}`, headers, body: JSON.stringify(body || {}) });
    if (r.status !== 200) { const e = httpError('Odoo', r); if (r.status === 404 && /json\/2/.test(String(r.text()).slice(0, 200)) === false) e.message += ' (JSON-2 API needs Odoo 19+; for Odoo 14-18 set "protocol": "jsonrpc" and "login")'; throw e; }
    return r.json();
  }
  async function login() {
    if (uid != null) return uid;
    if (!conn.database || !conn.login) throw Object.assign(new Error('Odoo jsonrpc needs "database" and "login" in connectors.json'), { code: 'invalid_config' });
    uid = await rpc('common', 'authenticate', [conn.database, conn.login, conn.secret, {}]);
    if (!uid) throw Object.assign(new Error('Odoo: login or API key refused'), { code: 'auth_failed' });
    return uid;
  }
  const kw = async (model, method, args, kwargs) => rpc('object', 'execute_kw', [conn.database, await login(), conn.secret, model, method, args, kwargs || {}]);
  // the three calls we need, in both protocols
  const searchRead = (model, domain, fields, limit) => (legacy ? kw(model, 'search_read', [domain], { fields, limit }) : json2(model, 'search_read', { domain, fields, limit }));
  const create = async (model, vals) => { const r = legacy ? await kw(model, 'create', [[vals]]) : await json2(model, 'create', { vals_list: [vals] }); return Array.isArray(r) ? r[0] : r; };
  const messagePost = (model, id, body, attachmentIds) => (legacy
    ? kw(model, 'message_post', [[id]], { body, attachment_ids: attachmentIds, message_type: 'comment', subtype_xmlid: 'mail.mt_note' })
    : json2(model, 'message_post', { ids: [id], body, attachment_ids: attachmentIds, message_type: 'comment', subtype_xmlid: 'mail.mt_note' }));

  async function ping() {
    let version = null;
    try { const v = await request(conn, { method: 'POST', path: 'web/webclient/version_info', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} }) }); if (v.status === 200) version = (v.json().result || {}).server_version || null; } catch (e) { /* version is optional */ }
    if (legacy) { await login(); return { ok: true, server_version: version, protocol: 'jsonrpc', user: conn.login }; }
    const ctx = await json2('res.users', 'context_get', {});
    return { ok: true, server_version: version, protocol: 'json2', user: ctx && ctx.uid ? 'uid ' + ctx.uid : null };
  }

  async function store(out, rule, vars, { dryRun = false } = {}) {
    const model = rule.model || 'res.partner';
    if (!/^[a-z0-9_.]+$/.test(model)) throw Object.assign(new Error('Odoo model name is not valid: ' + model), { code: 'invalid_input' });
    const find = fillAll(rule.find || { name: '{client}' }, vars);
    const domain = Object.entries(find).map(([k, v]) => [k, '=', v]);
    const name = fill(rule.name || '{file}', vars);
    const note = rule.note === false ? null : fill(rule.note || 'TTDU 처리 결과: {file}', vars);
    if (dryRun) return { status: 'dry_run', plan: { model, find, name, note } };
    let recs = await searchRead(model, domain, ['id', 'display_name'], 2);
    if (!recs.length) {
      if (rule.create_missing !== true) throw Object.assign(new Error(`Odoo 에 ${model} ${JSON.stringify(find)} 이(가) 없습니다.`), { code: 'not_found', details: { model, find } });
      recs = [{ id: await create(model, find) }];
    }
    if (recs.length > 1 && rule.pick !== 'first') throw Object.assign(new Error(`Odoo 에 ${model} ${JSON.stringify(find)} 이(가) 여러 개입니다. find 를 더 좁혀 주세요.`), { code: 'ambiguous', details: { model, find } });
    const rec = recs[0];
    const url = `${conn.url}/odoo/${model}/${rec.id}`;
    if (rule.on_duplicate !== 'store') {
      const sha1 = crypto.createHash('sha1').update(out.bytes).digest('hex'); // ir.attachment.checksum
      const dup = await searchRead('ir.attachment', [['res_model', '=', model], ['res_id', '=', rec.id], ['checksum', '=', sha1]], ['id', 'name'], 1);
      if (dup.length) return { status: 'duplicate', id: dup[0].id, record_id: rec.id, url, result: 'same file already attached' };
    }
    const attId = await create('ir.attachment', { name, datas: Buffer.from(out.bytes).toString('base64'), res_model: model, res_id: rec.id, mimetype: out.mime || mimeOf(out.name) });
    let noted = false, noteError = null;
    // plain text: Odoo 17+ escapes a non-Markup body itself (an HTML string would show its tags)
    if (note) { try { await messagePost(model, rec.id, note, [attId]); noted = true; } catch (e) { noteError = e.code || 'failed'; } }
    return { status: 'stored', id: attId, record_id: rec.id, record: rec.display_name || null, url, note: noted, ...(noteError ? { note_error: noteError } : {}) };
  }
  return { type: 'odoo', ping, store };
}
