// Copyright (c) 2026 박지훈(행복유통). MIT License (see LICENSE).
// Twenty CRM connector (Twenty 2.x; checked against v2.56.1): attach a result file to a company / person / opportunity.
// Twenty is AGPL-3.0 with the "Twenty Application Exception" (its LICENSE, AGPLv3 section 7): an application that talks
// to Twenty only through its published REST/GraphQL APIs and webhooks may use any license. This file does exactly that
// and contains no Twenty code. Twenty itself is installed separately by the office.
// Auth: Authorization: Bearer <API key> (Settings -> APIs & Webhooks; on 2.x an API key needs a role, e.g. Admin or a
//       narrower custom role that may read companies and create attachments).
// Steps (same as Twenty's own web app on 2.x):
//   1 REST GET  /rest/<objects>?filter=<field>[eq]:"value"         find the record
//   2 REST GET  /rest/metadata/objects                              id of the attachment object's FILES field "file"
//   3 GraphQL   /metadata createFileUpload(filename,size,fileFolder:FilesField,fieldMetadataId) -> fileId, uploadUrl
//   4 HTTP PUT  uploadUrl (signed URL on the Twenty server; checked by the same office-network rule, no API key sent)
//   5 GraphQL   /metadata completeFileUpload(fileId)
//   6 REST POST /rest/attachments { name, target<Object>Id, file: [{ fileId, label }] }
// Rule fields: object (company | person | opportunity, default company), find {field: value} (default
//   {name: "{client}"}), name (default "{file}"), on_duplicate 'skip' (default: an attachment with the same name on the
//   same record counts as already stored; Twenty does not expose file checksums) | 'store'
import { request, httpError } from './net.mjs';
import { fill, fillAll } from './template.mjs';

const PLURAL = { company: 'companies', person: 'people', opportunity: 'opportunities' };
const TARGET = { company: 'targetCompanyId', person: 'targetPersonId', opportunity: 'targetOpportunityId' };
const flt = (find) => Object.entries(find).map(([k, v]) => `${k}[eq]:${JSON.stringify(String(v))}`).join(',');

export function twenty(conn) {
  const H = { authorization: 'Bearer ' + conn.secret, accept: 'application/json' };
  const rest = async (method, p, body) => {
    const r = await request(conn, { method, path: 'rest/' + p, headers: body ? { ...H, 'content-type': 'application/json' } : H, body: body ? JSON.stringify(body) : null });
    if (r.status < 200 || r.status > 299) throw httpError('Twenty', r);
    return r.json();
  };
  const gql = async (query, variables) => {
    const r = await request(conn, { method: 'POST', path: 'metadata', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (r.status !== 200) throw httpError('Twenty', r);
    const j = r.json();
    if (j.errors && j.errors.length) { const m = String(j.errors[0].message || 'error'); throw Object.assign(new Error('Twenty: ' + m.slice(0, 300)), { code: /auth|forbidden|permission/i.test(m) ? 'auth_failed' : 'remote_error' }); }
    return j.data;
  };
  let fileFieldId = null;
  async function fileField() {
    if (fileFieldId) return fileFieldId;
    const j = await rest('GET', 'metadata/objects?limit=500');
    const objs = (j && j.data && (j.data.objects || j.data)) || [];
    const att = (Array.isArray(objs) ? objs : []).find((o) => o.nameSingular === 'attachment');
    const f = att && (att.fields || []).find((x) => x.name === 'file' && x.type === 'FILES');
    if (!f) throw Object.assign(new Error('Twenty: attachment "file" field not found (this connector needs Twenty 2.x)'), { code: 'unsupported' });
    return (fileFieldId = f.id);
  }
  async function ping() { const j = await rest('GET', 'companies?limit=1'); await fileField(); return { ok: true, companies: j && j.totalCount != null ? j.totalCount : null }; }

  async function store(out, rule, vars, { dryRun = false } = {}) {
    const object = rule.object || 'company';
    if (!PLURAL[object]) throw Object.assign(new Error('Twenty object must be one of ' + Object.keys(PLURAL).join(', ')), { code: 'invalid_input' });
    const find = fillAll(rule.find || { name: '{client}' }, vars);
    const name = fill(rule.name || '{file}', vars);
    if (dryRun) return { status: 'dry_run', plan: { object, find, name } };
    const j = await rest('GET', `${PLURAL[object]}?filter=${encodeURIComponent(flt(find))}&limit=2`);
    const recs = (j && j.data && j.data[PLURAL[object]]) || [];
    if (!recs.length) throw Object.assign(new Error(`Twenty 에 ${object} ${JSON.stringify(find)} 이(가) 없습니다.`), { code: 'not_found', details: { object, find } });
    if (recs.length > 1 && rule.pick !== 'first') throw Object.assign(new Error(`Twenty 에 ${object} ${JSON.stringify(find)} 이(가) 여러 개입니다. find 를 더 좁혀 주세요.`), { code: 'ambiguous', details: { object, find } });
    const rec = recs[0];
    const url = `${conn.url}/object/${object}/${rec.id}`;
    if (rule.on_duplicate !== 'store') {
      const d = await rest('GET', `attachments?filter=${encodeURIComponent(`${TARGET[object]}[eq]:${JSON.stringify(rec.id)},name[eq]:${JSON.stringify(name)}`)}&limit=1`);
      const hit = d && d.data && d.data.attachments && d.data.attachments[0];
      if (hit) return { status: 'duplicate', id: hit.id, record_id: rec.id, url, result: 'an attachment with the same name is already on this record' };
    }
    const c = await gql('mutation($filename:String!,$size:Float!,$fileFolder:FileFolder!,$fieldMetadataId:String){ createFileUpload(filename:$filename,size:$size,fileFolder:$fileFolder,fieldMetadataId:$fieldMetadataId){ fileId uploadUrl contentType } }', { filename: name, size: out.bytes.length, fileFolder: 'FilesField', fieldMetadataId: await fileField() });
    const up = c && c.createFileUpload;
    if (!up || !up.uploadUrl) throw Object.assign(new Error('Twenty createFileUpload returned no upload address'), { code: 'remote_error' });
    // the signed upload address is on the Twenty server (or its storage); same office-network rule, no API key sent
    const u = new URL(up.uploadUrl);
    const put = await request({ url: u.origin, allowPublic: conn.allowPublic, ca: conn.ca, timeoutMs: 300000 }, { method: 'PUT', path: u.pathname + u.search, headers: { 'content-type': up.contentType || 'application/octet-stream' }, body: Buffer.from(out.bytes) });
    if (put.status < 200 || put.status > 299) throw httpError('Twenty upload', put);
    await gql('mutation($fileId:String!){ completeFileUpload(fileId:$fileId){ id } }', { fileId: up.fileId });
    const a = await rest('POST', 'attachments', { name, [TARGET[object]]: rec.id, file: [{ fileId: up.fileId, label: name }] });
    const att = (a && a.data && (a.data.createAttachment || a.data.attachment)) || {};
    return { status: 'stored', id: att.id || null, record_id: rec.id, file_id: up.fileId, url };
  }
  return { type: 'twenty', ping, store };
}
