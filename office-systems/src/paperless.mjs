// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Paperless-ngx connector (REST API, token auth). Paperless-ngx itself is GPL-3.0 and is installed separately by
// the office; this file only talks to its published HTTP API.
// Rule fields: title, created (YYYYMMDD|YYYY-MM-DD), correspondent, document_type, tags[], storage_path,
//              custom_fields {name: value}, archive_serial_number, create_missing (default true: tags /
//              correspondents / document types are made when missing), wait (default true), wait_ms (default 180000),
//              on_duplicate: 'skip' (default: same file already stored -> no new document) | 'store'
// Docs: https://docs.paperless-ngx.com/api/ (POST /api/documents/post_document/, GET /api/tasks/?task_id=)
// Checked against Paperless-ngx 3.4.2 (API v10; v9 answers handled too). 3.x stores the same file again as a new
// document (2.x refused it), so we look the file up by checksum first (SHA-256 on 3.x, MD5 on 2.x).
import crypto from 'node:crypto';
import { request, formBody, httpError } from './net.mjs';
import { fill, isoDate, mimeOf } from './template.mjs';

const KIND_LABEL = { tags: '태그', correspondents: '거래처(correspondent)', document_types: '문서 종류', storage_paths: '보관 경로', custom_fields: '사용자 필드' };

export function paperless(conn) {
  const H = { authorization: 'Token ' + conn.secret, accept: 'application/json' };
  const call = async (method, p, { json, form, timeoutMs } = {}) => {
    let body = null; const headers = { ...H };
    if (json !== undefined) { body = JSON.stringify(json); headers['content-type'] = 'application/json'; }
    if (form) { const f = await formBody(form); body = f.body; headers['content-type'] = f.contentType; }
    return request(conn, { method, path: p, headers, body, timeoutMs });
  };
  const listOf = (j) => (Array.isArray(j) ? j : j && Array.isArray(j.results) ? j.results : []);
  const cache = new Map();

  async function ping() {
    const r = await call('GET', 'api/documents/?page_size=1');
    if (r.status !== 200) throw httpError('Paperless-ngx', r);
    return { ok: true, api_version: r.headers['x-api-version'] || null, server_version: r.headers['x-version'] || null, documents: (r.json() || {}).count };
  }

  /** id of a tag / correspondent / document type by exact name (case-insensitive); create when allowed */
  async function idOf(kind, name, create) {
    const key = kind + '\u0000' + name.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const find = async () => {
      const r = await call('GET', `api/${kind}/?name__iexact=${encodeURIComponent(name)}&page_size=10`);
      if (r.status !== 200) throw httpError('Paperless-ngx', r);
      const hit = listOf(r.json()).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
      return hit ? hit.id : null;
    };
    let id = await find();
    if (id == null) {
      if (!create) throw Object.assign(new Error(`Paperless-ngx 에 ${KIND_LABEL[kind] || kind} "${name}" 이(가) 없습니다.`), { code: 'not_found', details: { kind, name } });
      // matching_algorithm 0 = none: our label must not start auto-assigning itself to other documents
      const r = await call('POST', `api/${kind}/`, { json: { name, matching_algorithm: 0 } });
      if (r.status === 201 || r.status === 200) id = r.json().id;
      else { id = await find(); if (id == null) throw httpError('Paperless-ngx', r); } // made by someone else meanwhile
    }
    cache.set(key, id); return id;
  }

  async function waitTask(taskId, waitMs) {
    const t0 = Date.now(); let delay = 500;
    for (;;) {
      const r = await call('GET', `api/tasks/?task_id=${encodeURIComponent(taskId)}`);
      if (r.status !== 200) throw httpError('Paperless-ngx', r);
      const t = listOf(r.json()).find((x) => x.task_id === taskId);
      const st = t && String(t.status || '').toUpperCase();
      if (t && st === 'SUCCESS') {
        // v10: result_data.document_id / related_document_ids ; v9: related_document / result text
        const rd = t.result_data && typeof t.result_data === 'object' ? t.result_data : {};
        const id = rd.document_id != null ? Number(rd.document_id) : Array.isArray(t.related_document_ids) && t.related_document_ids.length ? Number(t.related_document_ids[0]) : t.related_document != null ? Number(t.related_document) : Number((/document id (\d+)/i.exec(String(t.result || '')) || [])[1]) || null;
        return { status: 'stored', id, result: t.result || (rd.document_id != null ? 'document ' + rd.document_id : null) };
      }
      if (t && (st === 'FAILURE' || st === 'REVOKED')) {
        const rd = t.result_data && typeof t.result_data === 'object' ? t.result_data : null;
        const msg = String(t.result || t.result_message || (rd && (rd.error || rd.message || rd.detail)) || (rd ? JSON.stringify(rd) : '') || st);
        const dup = /duplicate of .*?\(#(\d+)\)/i.exec(msg) || (/duplicate/i.test(msg) ? [null, t.related_document] : null);
        if (dup) return { status: 'duplicate', id: dup[1] != null ? Number(dup[1]) : null, result: msg.slice(0, 300) };
        throw Object.assign(new Error('Paperless-ngx 가 문서를 받지 못했습니다: ' + msg.slice(0, 300)), { code: 'remote_failed', details: { task_id: taskId } });
      }
      if (Date.now() - t0 > waitMs) return { status: 'queued', id: null, result: 'still processing after ' + waitMs + ' ms (task ' + taskId + ')' };
      await new Promise((ok) => setTimeout(ok, delay)); delay = Math.min(3000, delay * 1.5);
    }
  }

  /** store one output file. out = {name, bytes, mime?}; rule = delivery rule; vars = template values */
  async function store(out, rule, vars, { dryRun = false } = {}) {
    const create = rule.create_missing !== false;
    const title = fill(rule.title || '{stem}', vars).slice(0, 128);
    let created = null;
    if (rule.created) { created = isoDate(fill(rule.created, vars)); if (!created) throw Object.assign(new Error('created 날짜가 올바르지 않습니다: ' + rule.created), { code: 'invalid_input' }); }
    const plan = { title, created, correspondent: rule.correspondent ? fill(rule.correspondent, vars) : null, document_type: rule.document_type ? fill(rule.document_type, vars) : null, tags: (rule.tags || []).map((t) => fill(t, vars)).filter(Boolean), storage_path: rule.storage_path ? fill(rule.storage_path, vars) : null, custom_fields: rule.custom_fields ? Object.fromEntries(Object.entries(rule.custom_fields).map(([k, v]) => [k, fill(v, vars)])) : null };
    if (dryRun) return { status: 'dry_run', plan };
    if (rule.on_duplicate !== 'store') {
      for (const algo of ['sha256', 'md5']) {
        const sum = crypto.createHash(algo).update(out.bytes).digest('hex');
        const r = await call('GET', `api/documents/?checksum__iexact=${sum}&page_size=1&fields=id`);
        if (r.status !== 200) throw httpError('Paperless-ngx', r);
        const hit = listOf(r.json())[0];
        if (!hit) continue;
        // confirm on the document itself (a server that ignored the filter would list unrelated documents)
        const m = await call('GET', `api/documents/${hit.id}/metadata/`);
        if (m.status === 200 && String((m.json() || {}).original_checksum || '').toLowerCase() === sum) return { status: 'duplicate', id: hit.id, url: conn.url + '/documents/' + hit.id + '/details', result: 'same file already stored (' + algo + ')', plan };
      }
    }
    const fd = new FormData();
    fd.append('document', new Blob([out.bytes], { type: out.mime || mimeOf(out.name) }), out.name);
    fd.append('title', title);
    if (created) fd.append('created', created);
    if (plan.correspondent) fd.append('correspondent', String(await idOf('correspondents', plan.correspondent, create)));
    if (plan.document_type) fd.append('document_type', String(await idOf('document_types', plan.document_type, create)));
    if (plan.storage_path) fd.append('storage_path', String(await idOf('storage_paths', plan.storage_path, false)));
    for (const t of plan.tags) fd.append('tags', String(await idOf('tags', t, create)));
    if (rule.archive_serial_number != null) fd.append('archive_serial_number', String(fill(rule.archive_serial_number, vars)));
    if (plan.custom_fields) { const m = {}; for (const [k, v] of Object.entries(plan.custom_fields)) m[await idOf('custom_fields', k, false)] = v; fd.append('custom_fields', JSON.stringify(m)); }
    const r = await call('POST', 'api/documents/post_document/', { form: fd, timeoutMs: 300000 });
    if (r.status !== 200) throw httpError('Paperless-ngx', r);
    const taskId = String(r.json() || '').trim();
    if (rule.wait === false) return { status: 'queued', id: null, task_id: taskId, plan };
    const w = await waitTask(taskId, Number(rule.wait_ms) > 0 ? Number(rule.wait_ms) : 180000);
    return { ...w, task_id: taskId, url: w.id ? conn.url + '/documents/' + w.id + '/details' : null, plan };
  }

  return { type: 'paperless', ping, store, idOf };
}
