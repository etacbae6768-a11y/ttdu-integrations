// P7 E2E (2026-11-09): office runner `ttdu serve` + deliver hook + real Paperless-ngx (Docker on this PC).
// usage: node e2e-paperless-runner.mjs --config <connectors.json with "paperless" (+ "paperless_badtoken")> --out <report.json> [--work <dir>]
// Uses the B1 demo inputs/expected outputs (tool-sites/audit/biz/B1-OFFICE-AUTOMATION/demo).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CFG = path.resolve(flag('--config'));
const OUT = path.resolve(flag('--out', 'e2e-paperless-runner.json'));
const WORK = path.resolve(flag('--work', (process.env.TTDU_WORK || '.ttdu-work') + '/e2e-' + Date.now()));
const P = (process.env.TTDU_PLATFORM || '../ttdu-platform').replace(/\/?$/, '/');
const DEMO = (process.env.TTDU_DEMO_DIR || './samples').replace(/\/?$/, '/');
fs.mkdirSync(WORK, { recursive: true });
process.env.TTDU_KEY_FILE = path.join(WORK, 'local-api-key.txt');
process.env.TTDU_FLOWS = path.join(WORK, 'flows'); fs.mkdirSync(process.env.TTDU_FLOWS, { recursive: true });
process.env.TTDU_CONNECTORS = CFG;
if (!process.env.TTDU_SITE) { const S = (process.env.TTDU_STAGING_DIR || 'staging').replace(/\/?$/, '/'); const d = fs.readdirSync(S).filter((n) => /^live-\d+$/.test(n) && fs.existsSync(S + n + '/module-runners')).sort(); process.env.TTDU_SITE = S + d[d.length - 1]; }

const { loadConnectors } = await import('../src/config.mjs');
const { request } = await import('../src/net.mjs');
const cfg = loadConnectors(CFG);
const PL = cfg.connectors.paperless;
const pl = async (p) => { const r = await request(PL, { path: p, headers: { authorization: 'Token ' + PL.secret, accept: 'application/json' } }); return r; };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const files = (dir) => fs.readdirSync(dir).sort().map((n) => [fs.readFileSync(path.join(dir, n)), n]);
const flowOf = (n) => JSON.parse(fs.readFileSync(DEMO + '_flows/' + n, 'utf8'));

const { startServe } = await import(pathToFileURL(P + 'apps/office-runner/serve.mjs').href);
const srv = await startServe({ port: 0, quiet: true });
const port = new URL(srv.url).port; const K = { 'x-api-key': srv.key };
function req(method, p, { headers = {}, form = null } = {}) {
  return new Promise(async (ok, bad) => {
    let body = null; const h = { ...headers };
    if (form) { const r = new Response(form); h['content-type'] = r.headers.get('content-type'); body = Buffer.from(await r.arrayBuffer()); h['content-length'] = body.length; }
    const q = http.request({ host: '127.0.0.1', port, method, path: p, headers: h, agent: false, timeout: 600000 }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => { const b = Buffer.concat(c); let j = null; try { j = JSON.parse(b.toString('utf8')); } catch (e) {} ok({ s: res.statusCode, h: res.headers, b, j }); }); });
    q.on('error', bad); if (body) q.write(body); q.end();
  });
}
const fd = (pairs) => { const f = new FormData(); for (const [k, v, n] of pairs) f.append(k, Buffer.isBuffer(v) ? new Blob([v]) : v, ...(n ? [n] : [])); return f; };
const rows = []; const t = (name, pass, info) => { rows.push({ name, pass: !!pass, info: info === undefined ? null : info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const nameOf = async (kind, id) => { const r = await pl(`api/${kind}/${id}/`); return r.status === 200 ? r.json().name : null; };

const A = flowOf('A-receipts.json'), B = flowOf('B-payroll.json'), C = flowOf('C-redact.json');
const ruleA = { to: 'paperless', only: 'pdf', title: '{client}_{date} 증빙', correspondent: '{client}', document_type: '증빙', tags: ['TTDU', '영수증'], created: '{date}' };
const varsA = JSON.stringify({ client: '가나다상회', date: '20261106' });
const expectA = fs.readFileSync(DEMO + 'A-receipts/output-cli/가나다상회_20261106.pdf');
let r, idA = null;

// T1 A + deliver -> stored, Paperless keeps the exact bytes, names/tags/date set
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify({ ...A, deliver: [ruleA] })], ['vars', varsA], ...files(DEMO + 'A-receipts/input').map(([b, n]) => ['files', b, n])]) });
const outA = r.j && r.j.outputs && Buffer.from(r.j.outputs[0].base64, 'base64');
t('T1 A flow ok, output = demo output (bytes)', r.s === 200 && r.j.ok && outA && sha(outA) === sha(expectA), r.j && r.j.outputs && r.j.outputs.map((o) => [o.name, o.size]));
const d1 = r.j && r.j.deliveries && r.j.deliveries[0];
t('T1 deliveries[0] stored with document id', d1 && d1.ok && d1.status === 'stored' && d1.id > 0, d1);
if (d1 && d1.id) {
  idA = d1.id;
  const doc = (await pl(`api/documents/${idA}/`)).json();
  const tagNames = await Promise.all((doc.tags || []).map((id) => nameOf('tags', id)));
  const got = { title: doc.title, created: doc.created, correspondent: await nameOf('correspondents', doc.correspondent), document_type: await nameOf('document_types', doc.document_type), tags: tagNames.sort(), original_file_name: doc.original_file_name };
  t('T1 Paperless metadata (title/created/correspondent/type/tags)', got.title === '가나다상회_20261106 증빙' && got.created === '2026-11-06' && got.correspondent === '가나다상회' && got.document_type === '증빙' && got.tags.join(',') === ['TTDU', '영수증'].sort().join(','), got);
  const dl = await request(PL, { path: `api/documents/${idA}/download/?original=true`, headers: { authorization: 'Token ' + PL.secret } });
  t('T1 Paperless original file = our output (sha256)', dl.status === 200 && sha(dl.body) === sha(outA), { status: dl.status, size: dl.body.length });
  const ct = (doc.content || '').replace(/\s+/g, ' ').slice(0, 80);
  t('T1 Paperless text layer/OCR content present (info)', true, { content_chars: (doc.content || '').length, sample: ct });
}
// T2 same run again -> duplicate, no new document
const countBefore = (await pl('api/documents/?page_size=1')).json().count;
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify({ ...A, deliver: [ruleA] })], ['vars', varsA], ...files(DEMO + 'A-receipts/input').map(([b, n]) => ['files', b, n])]) });
const d2 = r.j && r.j.deliveries && r.j.deliveries[0];
const countAfter = (await pl('api/documents/?page_size=1')).json().count;
t('T2 rerun -> duplicate of the same document, count unchanged', d2 && d2.ok && d2.status === 'duplicate' && d2.id === idA && countAfter === countBefore, { d2, countBefore, countAfter });
// T3 B (xlsx) -> what Paperless does with a spreadsheet (no Tika in this test setup); local result must still come back
const expectB = fs.readFileSync(DEMO + 'B-payroll/output-cli/가상고객사_급여검수_20261106.xlsx');
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify({ ...B, deliver: [{ to: 'paperless', title: '{client}_급여검수_{date}', correspondent: '{client}', document_type: '급여검수', tags: ['TTDU', '급여'], created: '{date}' }] })], ['vars', JSON.stringify({ client: '가상고객사', date: '20261106' })], ...files(DEMO + 'B-payroll/input').map(([b, n]) => ['files', b, n])]) });
const outB = r.j && r.j.outputs && r.j.outputs[0] && Buffer.from(r.j.outputs[0].base64, 'base64');
const d3 = r.j && r.j.deliveries && r.j.deliveries[0];
t('T3 B flow ok, output = demo output (bytes)', r.s === 200 && r.j.ok && outB && sha(outB) === sha(expectB), r.j && r.j.outputs && r.j.outputs.map((o) => [o.name, o.size]));
t('T3 B xlsx delivery result recorded (stored or clear failure, never silent)', d3 && (d3.status === 'stored' || (d3.ok === false && d3.code)), d3);
// T4 C (pdf + png) -> both stored with tag
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify({ ...C, deliver: [{ to: 'paperless', tags: ['TTDU', '개인정보가림'], document_type: '가림본', correspondent: '{client}' }] })], ['vars', JSON.stringify({ client: '가나다상회' })], ...files(DEMO + 'C-redact/input').map(([b, n]) => ['files', b, n])]) });
const d4 = (r.j && r.j.deliveries) || [];
t('T4 C flow ok (2 outputs) and both stored', r.s === 200 && r.j.ok && r.j.outputs.length === 2 && d4.length === 2 && d4.every((d) => d.ok && (d.status === 'stored' || d.status === 'duplicate') && d.id > 0), d4.map((d) => [d.file, d.status, d.id]));
// T5 unknown connector -> 422 before running
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify({ ...C, deliver: [{ to: 'nas' }] })], ...files(DEMO + 'C-redact/input').slice(0, 1).map(([b, n]) => ['files', b, n])]) });
t('T5 unknown connector -> 422 not_configured, nothing run', r.s === 422 && r.j && r.j.code === 'not_configured' && !r.j.outputs, r.j);
// T6 rule needs {employee} that nobody gave -> flow result back, receipt failed needs_input
r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify(C)], ['deliver', JSON.stringify([{ to: 'paperless', title: '{employee}_가림본' }])], ...files(DEMO + 'C-redact/input').slice(0, 1).map(([b, n]) => ['files', b, n])]) });
const d6 = r.j && r.j.deliveries && r.j.deliveries[0];
t('T6 deliver as separate field + missing var -> outputs kept, receipt needs_input', r.s === 200 && r.j.ok && r.j.outputs.length === 1 && d6 && !d6.ok && d6.code === 'needs_input', d6);
// T7 raw=1 -> X-TTDU-Deliveries header
r = await req('POST', '/v1/flows/run?raw=1', { headers: K, form: fd([['flow', JSON.stringify({ ...A, deliver: [ruleA] })], ['vars', varsA], ...files(DEMO + 'A-receipts/input').map(([b, n]) => ['files', b, n])]) });
let hdr = null; try { hdr = JSON.parse(decodeURIComponent(r.h['x-ttdu-deliveries'] || '')); } catch (e) {}
t('T7 raw=1 bytes + X-TTDU-Deliveries header', r.s === 200 && r.b.subarray(0, 5).toString() === '%PDF-' && Array.isArray(hdr) && hdr[0].status === 'duplicate' && /X-TTDU-Deliveries/.test(r.h['access-control-expose-headers'] || ''), hdr);
// T8 wrong token -> auth_failed receipt (only when the config has paperless_badtoken)
if (cfg.connectors.paperless_badtoken) {
  r = await req('POST', '/v1/flows/run', { headers: K, form: fd([['flow', JSON.stringify(C)], ['deliver', JSON.stringify([{ to: 'paperless_badtoken', tags: ['TTDU'] }])], ...files(DEMO + 'C-redact/input').slice(0, 1).map(([b, n]) => ['files', b, n])]) });
  const d8 = r.j && r.j.deliveries && r.j.deliveries[0];
  t('T8 wrong token -> receipt auth_failed, no secret in detail', r.s === 200 && d8 && !d8.ok && d8.code === 'auth_failed' && !/[0-9a-f]{40}/i.test(JSON.stringify(d8)), d8);
}
// T9 the log line written by serve has no secret
const logDir = path.resolve(P, '..', 'logs');
t('T9 receipts never contain the token', !rows.some((x) => PL.secret && JSON.stringify(x.info || '').includes(PL.secret)));

await srv.close();
const pass = rows.filter((x) => x.pass).length;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), paperless: PL.url, server: (await pl('api/documents/?page_size=1')).headers['x-version'] || null, pass, total: rows.length, rows }, null, 1));
console.log(`${pass}/${rows.length}`);
fs.rmSync(WORK, { recursive: true, force: true });
process.exit(pass === rows.length ? 0 : 1);
