// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// ERPNext / Frappe connector: attach a result file to a document (Customer, Supplier, Employee, Sales Invoice, ...)
// through the Frappe REST API. ERPNext (GPL-3.0) is installed separately by the office; we only call its HTTP API
// as an outside client (no Frappe app is installed inside ERPNext, so nothing of ours runs in its process).
// Auth: Authorization: token <api_key>:<api_secret>   (secret_file holds "api_key:api_secret")
// Optional connectors.json "site": sent as X-Frappe-Site-Name (needed when the address does not carry the site's host name)
// Docs: https://docs.frappe.io/framework/user/en/api/rest  (GET /api/resource/<DocType>, POST /api/method/upload_file)
// Rule fields: doctype (default Customer), find {field: value} (default {customer_name: "{client}"} for Customer,
//   {employee_name: "{employee}"} for Employee, else {name: "{name}"}), file_name (default "{file}"),
//   is_private (default 1), comment (text added to the document timeline, default none), on_duplicate 'skip'|'store'
import crypto from 'node:crypto';
import { request, formBody, httpError } from './net.mjs';
import { fill, fillAll, mimeOf } from './template.mjs';

const DEFAULT_FIND = { Customer: { customer_name: '{client}' }, Supplier: { supplier_name: '{client}' }, Employee: { employee_name: '{employee}' } };
const slug = (dt) => String(dt).toLowerCase().replace(/ /g, '-');

export function erpnext(conn) {
  const H = { authorization: 'token ' + conn.secret, accept: 'application/json', ...(conn.site ? { 'x-frappe-site-name': conn.site } : {}) };
  const get = async (p) => { const r = await request(conn, { path: p, headers: H }); if (r.status !== 200) throw httpError('ERPNext', r); return r.json(); };
  const list = (doctype, filters, fields, limit) => get(`api/resource/${encodeURIComponent(doctype)}?filters=${encodeURIComponent(JSON.stringify(filters))}&fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=${limit}`).then((j) => (j && j.data) || []);

  async function ping() {
    const j = await get('api/method/frappe.auth.get_logged_user');
    let version = null;
    try { const v = await get('api/method/frappe.utils.change_log.get_versions'); version = v && v.message && v.message.erpnext ? 'erpnext ' + v.message.erpnext.version : null; } catch (e) { /* optional */ }
    return { ok: true, user: j && j.message, server_version: version };
  }

  async function store(out, rule, vars, { dryRun = false } = {}) {
    const doctype = rule.doctype || 'Customer';
    const find = fillAll(rule.find || DEFAULT_FIND[doctype] || { name: '{name}' }, vars);
    const fileName = fill(rule.file_name || '{file}', vars);
    const isPrivate = rule.is_private === 0 || rule.is_private === false ? '0' : '1';
    if (dryRun) return { status: 'dry_run', plan: { doctype, find, file_name: fileName, is_private: isPrivate } };
    const recs = await list(doctype, Object.entries(find).map(([k, v]) => [k, '=', v]), ['name'], 2);
    if (!recs.length) throw Object.assign(new Error(`ERPNext 에 ${doctype} ${JSON.stringify(find)} 이(가) 없습니다.`), { code: 'not_found', details: { doctype, find } });
    if (recs.length > 1 && rule.pick !== 'first') throw Object.assign(new Error(`ERPNext 에 ${doctype} ${JSON.stringify(find)} 이(가) 여러 개입니다. find 를 더 좁혀 주세요.`), { code: 'ambiguous', details: { doctype, find } });
    const docname = recs[0].name;
    const url = `${conn.url}/app/${slug(doctype)}/${encodeURIComponent(docname)}`;
    if (rule.on_duplicate !== 'store') {
      const md5 = crypto.createHash('md5').update(out.bytes).digest('hex'); // File.content_hash
      const dup = await list('File', [['attached_to_doctype', '=', doctype], ['attached_to_name', '=', docname], ['content_hash', '=', md5]], ['name', 'file_url'], 1);
      if (dup.length) return { status: 'duplicate', id: dup[0].name, record_id: docname, url, result: 'same file already attached' };
    }
    const fd = new FormData();
    fd.append('file', new Blob([out.bytes], { type: out.mime || mimeOf(out.name) }), fileName);
    fd.append('doctype', doctype); fd.append('docname', docname); fd.append('is_private', isPrivate); fd.append('file_name', fileName);
    const f = await formBody(fd);
    const r = await request(conn, { method: 'POST', path: 'api/method/upload_file', headers: { ...H, 'content-type': f.contentType }, body: f.body, timeoutMs: 300000 });
    if (r.status !== 200) throw httpError('ERPNext', r);
    const m = (r.json() || {}).message || {};
    let commented = false;
    if (rule.comment) {
      const c = await request(conn, { method: 'POST', path: 'api/resource/Comment', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ comment_type: 'Comment', reference_doctype: doctype, reference_name: docname, content: fill(rule.comment, vars) }) });
      commented = c.status === 200;
    }
    return { status: 'stored', id: m.name || null, record_id: docname, file_url: m.file_url || null, url, ...(rule.comment ? { comment: commented } : {}) };
  }
  return { type: 'erpnext', ping, store };
}
