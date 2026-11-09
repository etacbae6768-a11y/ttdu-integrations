// Unit tests with local mock servers (no Docker): node test/unit.mjs [report.json]
// Checks request shapes (auth header, paths, multipart fields), duplicate handling, error mapping, address policy,
// secret hiding and template rules for all four connectors.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { classifyIp, checkBaseUrl, request } from '../src/net.mjs';
import { loadConnectors, describe } from '../src/config.mjs';
import { fill, isoDate, ruleMatches } from '../src/template.mjs';
import { deliver, checkRules } from '../src/deliver.mjs';

const rows = []; const t = (name, pass, info) => { rows.push({ name, pass: !!pass, ...(info !== undefined ? { info } : {}) }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !pass ? ' ' + JSON.stringify(info) : '')); };
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };
async function mock(handler) {
  const log = [];
  const srv = http.createServer(async (req, res) => { const c = []; for await (const x of req) c.push(x); const body = Buffer.concat(c); log.push({ method: req.method, url: req.url, headers: req.headers, body }); const [status, obj, headers] = await handler(req, body, log); res.writeHead(status, { 'content-type': 'application/json', ...(headers || {}) }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  return { url: 'http://127.0.0.1:' + srv.address().port, log, close: () => new Promise((ok) => srv.close(ok)) };
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttdu-oc-'));
const cfgFor = (connectors) => { fs.writeFileSync(path.join(dir, 's.txt'), 'SECRET-TOKEN-1234567890\n'); fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify({ schema: 'ttdu.connectors/v1', connectors })); return loadConnectors(path.join(dir, 'c.json')); };
const PDF = new Uint8Array(Buffer.from('%PDF-1.4\n% test\n'));

// ---- policy / config / templates
t('classifyIp ranges', classifyIp('127.0.0.1') === 'loopback' && classifyIp('10.1.2.3') === 'private' && classifyIp('172.20.0.1') === 'private' && classifyIp('172.32.0.1') === 'public' && classifyIp('192.168.0.20') === 'private' && classifyIp('100.100.1.1') === 'cgnat' && classifyIp('8.8.8.8') === 'public' && classifyIp('::1') === 'loopback' && classifyIp('fd00::1') === 'private' && classifyIp('2001:4860::1') === 'public' && classifyIp('::ffff:192.168.1.1') === 'private');
t('public IP address refused unless allow_public', throwsCode(() => checkBaseUrl('http://8.8.8.8:8000', false), 'destination_not_allowed') && !!checkBaseUrl('http://8.8.8.8:8000', true));
t('user:pass@ in address refused', throwsCode(() => checkBaseUrl('http://u:p@192.168.0.2/', false), 'invalid_config'));
t('ftp:// refused', throwsCode(() => checkBaseUrl('ftp://192.168.0.2/', false), 'invalid_config'));
let dnsDenied = null; try { await request({ url: 'http://dns-public-test.invalid.ttdu-test', allowPublic: false }, { path: '/' }); } catch (e) { dnsDenied = e.code; }
t('unresolvable name fails without sending (no fallback)', dnsDenied === 'ENOTFOUND' || dnsDenied === 'EAI_AGAIN' || dnsDenied === 'destination_not_allowed', dnsDenied);
const c1 = cfgFor({ p: { type: 'paperless', url: 'http://127.0.0.1:9', secret_file: 's.txt' } });
t('secret not in JSON.stringify(config) nor describe()', !JSON.stringify(c1).includes('SECRET-TOKEN') && !describe(c1).join('').includes('SECRET-TOKEN') && c1.connectors.p.secret === 'SECRET-TOKEN-1234567890');
t('config: unknown type refused', throwsCode(() => cfgFor({ p: { type: 'dropbox', url: 'http://127.0.0.1:9', secret_file: 's.txt' } }), 'invalid_config'));
t('config: missing secret refused', throwsCode(() => cfgFor({ p: { type: 'paperless', url: 'http://127.0.0.1:9' } }), 'invalid_config'));
t('config: env TTDU_SECRET_<ID> works', (() => { process.env.TTDU_SECRET_PX = 'ENVSECRET'; const c = cfgFor({ px: { type: 'paperless', url: 'http://127.0.0.1:9' } }); delete process.env.TTDU_SECRET_PX; return c.connectors.px.secret === 'ENVSECRET'; })());
t('fill: missing var -> needs_input', throwsCode(() => fill('{client}_{date}', { client: 'a' }), 'needs_input') && fill('{client}_{date}', { client: 'a', date: '1' }) === 'a_1');
t('isoDate: real dates only', isoDate('20261106') === '2026-11-06' && isoDate('2026-02-30') === null && isoDate('2026.11.06') === '2026-11-06' && isoDate('abc') === null);
t('ruleMatches only/match', ruleMatches({ only: 'pdf' }, 'a.PDF') && !ruleMatches({ only: 'pdf' }, 'a.xlsx') && ruleMatches({ only: ['pdf', 'xlsx'] }, 'a.xlsx') && ruleMatches({ match: '^가나' }, '가나다.pdf') && !ruleMatches({ match: '^가나' }, 'x.pdf'));
t('checkRules: unknown connector -> not_configured', throwsCode(() => checkRules([{ to: 'nas' }], c1), 'not_configured') && throwsCode(() => checkRules([{}], c1), 'invalid_input'));

// ---- redirect refused
{ const m = await mock(async () => [302, {}, { location: 'http://8.8.8.8/' }]); let code = null; try { await request({ url: m.url }, { path: '/' }); } catch (e) { code = e.code; } t('3xx redirect refused (never followed)', code === 'redirect_refused' && m.log.length === 1, code); await m.close(); }

// ---- paperless (mock of 3.x answers)
{
  const ids = { tags: { TTDU: 1 }, correspondents: {}, document_types: {} };
  const m = await mock(async (req, body) => {
    const u = new URL(req.url, 'http://x');
    if (req.headers.authorization !== 'Token SECRET-TOKEN-1234567890') return [401, { detail: 'Invalid token.' }];
    if (u.pathname === '/api/documents/' && u.searchParams.get('checksum__iexact')) return [200, { count: 0, results: [] }];
    const k = /^\/api\/(tags|correspondents|document_types)\/$/.exec(u.pathname);
    if (k && req.method === 'GET') { const n = u.searchParams.get('name__iexact'); const id = ids[k[1]][n]; return [200, { count: id ? 1 : 0, results: id ? [{ id, name: n }] : [] }]; }
    if (k && req.method === 'POST') { const j = JSON.parse(body.toString()); const id = 100 + Object.keys(ids[k[1]]).length; ids[k[1]][j.name] = id; return [201, { id, name: j.name, matching_algorithm: j.matching_algorithm }]; }
    if (u.pathname === '/api/documents/post_document/') return [200, '"6f1d2c3b-0000-4000-8000-000000000001"'];
    if (u.pathname === '/api/tasks/') return [200, { count: 1, results: [{ task_id: '6f1d2c3b-0000-4000-8000-000000000001', status: 'success', result_data: { document_id: 77 }, related_document_ids: [77] }] }];
    return [404, { detail: 'nf' }];
  });
  const cfg = cfgFor({ paperless: { type: 'paperless', url: m.url, secret_file: 's.txt' } });
  const rec = await deliver({ outputs: [{ name: '가나다_20261106.pdf', bytes: PDF }], rules: [{ to: 'paperless', title: '{client}_{date}', correspondent: '{client}', document_type: '증빙', tags: ['TTDU', '영수증'], created: '{date}' }], vars: { client: '가나다', date: '20261106' }, config: cfg });
  const post = m.log.find((x) => x.url === '/api/documents/post_document/');
  const form = post ? post.body.toString('latin1') : '';
  const created = m.log.filter((x) => x.method === 'POST' && /^\/api\/(tags|correspondents|document_types)\/$/.test(x.url)).map((x) => JSON.parse(x.body.toString()));
  t('paperless: stored with v10 task answer (document id)', rec[0].ok && rec[0].status === 'stored' && rec[0].id === 77, rec[0]);
  t('paperless: missing labels created with matching_algorithm 0, existing tag reused', created.length === 3 && created.every((c) => c.matching_algorithm === 0) && !created.some((c) => c.name === 'TTDU'), created);
  t('paperless: multipart has document/title/created/correspondent/document_type/2 tags', /name="document"; filename=/.test(form) && /name="created"\r\n\r\n2026-11-06/.test(form) && (form.match(/name="tags"/g) || []).length === 2 && /name="correspondent"/.test(form) && /name="document_type"/.test(form));
  t('paperless: checksum looked up first (sha256 then md5)', m.log.filter((x) => /checksum__iexact=/.test(x.url)).length === 2);
  const bad = cfgFor({ paperless: { type: 'paperless', url: m.url, secret_file: 'b.txt' } }.paperless ? { paperless: { type: 'paperless', url: m.url, secret_file: 's.txt' } } : {});
  process.env.TTDU_SECRET_PBAD = 'WRONG'; const cb = cfgFor({ pbad: { type: 'paperless', url: m.url } }); delete process.env.TTDU_SECRET_PBAD;
  const r2 = await deliver({ outputs: [{ name: 'a.pdf', bytes: PDF }], rules: [{ to: 'pbad' }], vars: {}, config: cb });
  t('paperless: wrong token -> auth_failed receipt', !r2[0].ok && r2[0].code === 'auth_failed', r2[0]);
  void bad; await m.close();
}

// ---- odoo json2 + jsonrpc
{
  const calls = [];
  const m = await mock(async (req, body) => {
    const u = new URL(req.url, 'http://x'); const j = body.length ? JSON.parse(body.toString()) : {};
    if (u.pathname === '/jsonrpc') { const p = j.params; calls.push(['rpc', p.service, p.method, p.args[3], p.args[4]]); if (p.service === 'common') return [200, { jsonrpc: '2.0', id: j.id, result: p.args[2] === 'SECRET-TOKEN-1234567890' ? 2 : false }]; const [, , , model, method] = p.args; if (method === 'search_read' && model === 'ir.attachment') return [200, { result: [] }]; if (method === 'search_read') return [200, { result: [{ id: 6, display_name: '가나다' }] }]; if (method === 'create') return [200, { result: [91] }]; if (method === 'message_post') return [200, { result: 5 }]; return [200, { result: null }]; }
    const mm = /^\/json\/2\/([a-z_.]+)\/([a-z_]+)$/.exec(u.pathname); if (!mm) return [404, {}];
    if (req.headers.authorization !== 'bearer SECRET-TOKEN-1234567890') return [401, { name: 'werkzeug.exceptions.Unauthorized', message: 'Invalid apikey' }];
    calls.push(['json2', mm[1], mm[2], j, req.headers['x-odoo-database']]);
    if (mm[2] === 'search_read' && mm[1] === 'ir.attachment') return [200, []];
    if (mm[2] === 'search_read') return [200, [{ id: 6, display_name: '가나다' }]];
    if (mm[2] === 'create') return [200, [90]];
    if (mm[2] === 'message_post') return [200, 4];
    if (mm[2] === 'context_get') return [200, { uid: 2 }];
    return [200, null];
  });
  const cfg = cfgFor({ odoo: { type: 'odoo', url: m.url, database: 'office', secret_file: 's.txt' }, odoo_old: { type: 'odoo', url: m.url, database: 'office', protocol: 'jsonrpc', login: 'admin', secret_file: 's.txt' } });
  const r = await deliver({ outputs: [{ name: 'a.xlsx', bytes: PDF }], rules: [{ to: 'odoo', find: { name: '{client}' } }], vars: { client: '가나다' }, config: cfg });
  const att = calls.find((c) => c[0] === 'json2' && c[1] === 'ir.attachment' && c[2] === 'create');
  const note = calls.find((c) => c[0] === 'json2' && c[2] === 'message_post');
  t('odoo json2: attachment create (vals_list, base64, res_model/res_id) + plain-text note', r[0].ok && r[0].status === 'stored' && r[0].id === 90 && att && att[3].vals_list[0].res_model === 'res.partner' && att[3].vals_list[0].res_id === 6 && Buffer.from(att[3].vals_list[0].datas, 'base64').equals(Buffer.from(PDF)) && att[4] === 'office' && note && !/<p>/.test(note[3].body) && note[3].attachment_ids[0] === 90, { r: r[0], att: att && att[3].vals_list[0].name });
  const dupq = calls.find((c) => c[0] === 'json2' && c[1] === 'ir.attachment' && c[2] === 'search_read');
  t('odoo json2: duplicate check by sha1 checksum on the record', dupq && JSON.stringify(dupq[3].domain).includes(crypto.createHash('sha1').update(PDF).digest('hex')));
  const r2 = await deliver({ outputs: [{ name: 'b.pdf', bytes: PDF }], rules: [{ to: 'odoo_old', model: 'hr.employee', find: { name: '{employee}' } }], vars: { employee: '홍길동' }, config: cfg });
  t('odoo jsonrpc: authenticate then execute_kw create on hr.employee', r2[0].ok && r2[0].id === 91 && calls.some((c) => c[0] === 'rpc' && c[1] === 'common') && calls.some((c) => c[0] === 'rpc' && c[3] === 'ir.attachment' && c[4] === 'create'), r2[0]);
  await m.close();
}

// ---- erpnext
{
  const m = await mock(async (req, body) => {
    const u = new URL(req.url, 'http://x');
    if (req.headers.authorization !== 'token SECRET-TOKEN-1234567890') return [401, { exc_type: 'AuthenticationError' }];
    if (u.pathname === '/api/resource/Customer') return [200, { data: [{ name: 'CUST-0001' }] }];
    if (u.pathname === '/api/resource/File') return [200, { data: [] }];
    if (u.pathname === '/api/method/upload_file') return [200, { message: { name: 'f1a2b3', file_url: '/private/files/a.pdf' } }];
    if (u.pathname === '/api/resource/Comment') return [200, { data: { name: 'c1' } }];
    return [404, {}];
  });
  const cfg = cfgFor({ erp: { type: 'erpnext', url: m.url, secret_file: 's.txt' } });
  const r = await deliver({ outputs: [{ name: '가나다_증빙.pdf', bytes: PDF }], rules: [{ to: 'erp', comment: 'TTDU: {file}' }], vars: { client: '가나다' }, config: cfg });
  const up = m.log.find((x) => x.url === '/api/method/upload_file'); const f = up ? up.body.toString('utf8') : '';
  const q = m.log.find((x) => x.url.startsWith('/api/resource/Customer'));
  t('erpnext: find Customer by customer_name, upload_file with doctype/docname/is_private=1, comment', r[0].ok && r[0].status === 'stored' && r[0].id === 'f1a2b3' && r[0].comment === true && /customer_name/.test(decodeURIComponent(q.url)) && /name="doctype"\r\n\r\nCustomer/.test(f) && /name="docname"\r\n\r\nCUST-0001/.test(f) && /name="is_private"\r\n\r\n1/.test(f), r[0]);
  t('erpnext: duplicate check by md5 content_hash', m.log.some((x) => x.url.startsWith('/api/resource/File') && decodeURIComponent(x.url).includes(crypto.createHash('md5').update(PDF).digest('hex'))));
  await m.close();
}

// ---- twenty 2.x (mock of the answers seen on a real v2.56.1)
{
  const m = await mock(async (req, body) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/file-upload/')) return [req.headers.authorization ? 400 : 204, ''];
    if (req.headers.authorization !== 'Bearer SECRET-TOKEN-1234567890') return [401, { message: 'Unauthorized' }];
    if (u.pathname === '/rest/companies') return [200, { data: { companies: [{ id: 'c-1', name: '가나다' }] }, totalCount: 1 }];
    if (u.pathname === '/rest/metadata/objects') return [200, { data: { objects: [{ nameSingular: 'attachment', fields: [{ id: 'fld-1', name: 'file', type: 'FILES' }] }] } }];
    if (u.pathname === '/rest/attachments' && req.method === 'GET') return [200, { data: { attachments: [] } }];
    if (u.pathname === '/metadata') { const q = JSON.parse(body.toString()); if (/createFileUpload/.test(q.query)) return [200, { data: { createFileUpload: { fileId: 'f-1', uploadUrl: 'http://127.0.0.1:' + req.socket.localPort + '/file-upload/f-1?token=abc', contentType: 'application/pdf' } } }]; if (/completeFileUpload/.test(q.query)) return [200, { data: { completeFileUpload: { id: 'f-1' } } }]; }
    if (u.pathname === '/rest/attachments' && req.method === 'POST') return [201, { data: { createAttachment: { id: 'att-1' } } }];
    return [404, {}];
  });
  const cfg = cfgFor({ tw: { type: 'twenty', url: m.url, secret_file: 's.txt' } });
  const r = await deliver({ outputs: [{ name: 'q.pdf', bytes: PDF }], rules: [{ to: 'tw' }], vars: { client: '가나다' }, config: cfg });
  const c = m.log.find((x) => x.url === '/metadata' && /createFileUpload/.test(x.body.toString())); const put = m.log.find((x) => x.method === 'PUT'); const a = m.log.find((x) => x.url === '/rest/attachments' && x.method === 'POST');
  const ab = a ? JSON.parse(a.body.toString()) : {};
  t('twenty 2.x (mock): filter name[eq], createFileUpload with FILES field id, PUT without API key, attachment targetCompanyId + file[fileId]', r[0].ok && r[0].id === 'att-1' && /name%5Beq%5D|name\[eq\]/.test(m.log[0].url) && c && JSON.parse(c.body.toString()).variables.fieldMetadataId === 'fld-1' && put && !put.headers.authorization && Buffer.from(put.body).equals(Buffer.from(PDF)) && ab.targetCompanyId === 'c-1' && ab.file[0].fileId === 'f-1', r[0]);
  await m.close();
}
fs.rmSync(dir, { recursive: true, force: true });
const pass = rows.filter((r) => r.pass).length;
console.log(`${pass}/${rows.length}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ at: new Date().toISOString(), pass, total: rows.length, rows }, null, 1));
process.exit(pass === rows.length ? 0 : 1);
